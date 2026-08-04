import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  DescargadorPdfIndiceRegistroOficial,
  EntradaDetectadaResumen,
  ExtractorIndiceMensualRegistroOficial,
  ResultadoDescargaPdfIndice,
  ResultadoExtraccionIndice,
} from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerTestDatabaseUrlDesdeEntorno } from '../prisma/validar-url-base-datos-test';
import {
  TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
  TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
} from '../ingesta/tokens';

// Seed compartido con el script `prisma:seed` (única fuente de verdad).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sembrar, CONTRASENA_SEMILLA } = require('../../scripts/seed-prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aplicarChecksPrisma } = require('../../scripts/aplicar-checks-prisma');

const CORREO_SUPERADMIN = 'superadmin@test.com';
const CORREO_EDITOR = 'editor@test.com';

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

const URL_VALIDA = 'https://esacc.corteconstitucional.gob.ec/storage/indice-prisma';
const SHA_VALIDO = 'c'.repeat(64);
const VERSION_ACTUAL = 'indice-mensual-v1';

function restaurarVariableEntorno(
  nombre: string,
  valorPrevio: string | undefined,
) {
  if (valorPrevio === undefined) {
    delete process.env[nombre];
    return;
  }
  process.env[nombre] = valorPrevio;
}

class DescargadorPdfIndiceFake implements DescargadorPdfIndiceRegistroOficial {
  readonly llamadas: string[] = [];
  resultado: ResultadoDescargaPdfIndice = {
    exitoso: true,
    bytes: new Uint8Array([1, 2, 3]),
    tamanioBytes: 3,
    sha256Pdf: SHA_VALIDO,
  };

  async descargar(urlPdf: string): Promise<ResultadoDescargaPdfIndice> {
    this.llamadas.push(urlPdf);
    return this.resultado;
  }
}

class ExtractorIndiceMensualFake implements ExtractorIndiceMensualRegistroOficial {
  readonly versionExtractor = VERSION_ACTUAL;
  llamadas = 0;
  resultado: ResultadoExtraccionIndice;

  constructor(entradasDetectadas: EntradaDetectadaResumen[]) {
    this.resultado = {
      exitoso: true,
      periodoDetectado: { anio: 2026, mes: 8 },
      totalPaginas: 1,
      entradasDetectadas,
    };
  }

  async extraer(): Promise<ResultadoExtraccionIndice> {
    this.llamadas += 1;
    return this.resultado;
  }
}

describirPrisma(
  'Índices mensuales por URL: Analizar/Confirmar (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let persistenciaPrevia: string | undefined;
    let databaseUrlPrevia: string | undefined;
    let extractorFake: ExtractorIndiceMensualFake;
    let descargadorFake: DescargadorPdfIndiceFake;

    const corrida = randomUUID().slice(0, 8);
    const numeroEdicion = 800_000_000 + (Number.parseInt(corrida, 16) % 100_000_000);

    function entradaFake(
      overrides: Partial<EntradaDetectadaResumen> = {},
    ): EntradaDetectadaResumen {
      return {
        posicion: 0,
        tipo: 'Resolución',
        numero: `R-${corrida}`,
        titulo: `Resolución de prueba ${corrida}`,
        institucion: 'Institución de prueba',
        seccion: 'Función Ejecutiva',
        publicacion: { tipo: 'RO', numero: numeroEdicion, fecha: '2026-08-04' },
        segmentoCrudo: `segmento ${corrida}`,
        metadataExtraccion: {},
        advertencias: [],
        confianza: 1,
        ...overrides,
      };
    }

    async function autorizacionDe(correo: string): Promise<string> {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo, contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      return `Bearer ${login.body.accessToken}`;
    }

    beforeAll(async () => {
      persistenciaPrevia = process.env.PERSISTENCIA;
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.PERSISTENCIA = 'prisma';
      process.env.DATABASE_URL = testDatabaseUrl;

      prisma = new PrismaService();
      await prisma.$connect();
      await aplicarChecksPrisma(prisma);
      await sembrar(prisma);
      await prisma.loteIngestaRegistroOficial.deleteMany({
        where: { periodoAnio: 2026, periodoMes: 8 },
      });

      descargadorFake = new DescargadorPdfIndiceFake();
      extractorFake = new ExtractorIndiceMensualFake([entradaFake()]);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AppModule } = require('../app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL)
        .useValue(descargadorFake)
        .overrideProvider(TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL)
        .useValue(extractorFake)
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
      restaurarVariableEntorno('PERSISTENCIA', persistenciaPrevia);
      restaurarVariableEntorno('DATABASE_URL', databaseUrlPrevia);
    });

    function servidor() {
      return app.getHttpServer();
    }

    it('Analizar no escribe en PostgreSQL: cero filas nuevas en lotes/entradas/normas/ediciones', async () => {
      const autorizacion = await autorizacionDe(CORREO_SUPERADMIN);
      const [lotesAntes, entradasAntes, normasAntes, edicionesAntes] =
        await Promise.all([
          prisma.loteIngestaRegistroOficial.count(),
          prisma.entradaDetectadaRegistroOficial.count(),
          prisma.norma.count(),
          prisma.edicionRegistroOficial.count(),
        ]);

      const respuesta = await request(servidor())
        .post('/ingesta/registro-oficial/indices/analizar')
        .set('Authorization', autorizacion)
        .send({
          urlPdf: URL_VALIDA,
          periodoEsperado: { anio: 2026, mes: 8 },
        });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.analisis.totalEntradas).toBe(1);
      expect(respuesta.body.entradasDetectadas).toHaveLength(1);

      const [lotesDespues, entradasDespues, normasDespues, edicionesDespues] =
        await Promise.all([
          prisma.loteIngestaRegistroOficial.count(),
          prisma.entradaDetectadaRegistroOficial.count(),
          prisma.norma.count(),
          prisma.edicionRegistroOficial.count(),
        ]);

      expect(lotesDespues).toBe(lotesAntes);
      expect(entradasDespues).toBe(entradasAntes);
      expect(normasDespues).toBe(normasAntes);
      expect(edicionesDespues).toBe(edicionesAntes);
    });

    it('Confirmar: crea lote/entrada/norma/edición reales en PostgreSQL, con la URL confirmada como urlResumenMensualRegistroOficial', async () => {
      const autorizacion = await autorizacionDe(CORREO_SUPERADMIN);

      const respuesta = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .set('Authorization', autorizacion)
        .send({
          urlPdf: URL_VALIDA,
          periodoEsperado: { anio: 2026, mes: 8 },
          sha256PdfObservado: SHA_VALIDO,
          versionExtractorObservada: VERSION_ACTUAL,
        });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.creado).toBe(true);
      const loteId = respuesta.body.lote.id as string;

      const loteEnBd = await prisma.loteIngestaRegistroOficial.findUnique({
        where: { periodoAnio_periodoMes: { periodoAnio: 2026, periodoMes: 8 } },
      });
      expect(loteEnBd?.id).toBe(loteId);
      expect(loteEnBd?.urlResumenMensualRegistroOficial).toBe(URL_VALIDA);
      expect(loteEnBd?.versionExtractor).toBe(VERSION_ACTUAL);

      const entradaEnBd = await prisma.entradaDetectadaRegistroOficial.findFirst({
        where: { loteId },
      });
      expect(entradaEnBd).not.toBeNull();

      const normaEnBd = await prisma.norma.findUnique({
        where: { id: entradaEnBd!.normaId },
        include: { edicionRegistroOficial: true },
      });
      expect(normaEnBd?.estadoEditorial).toBe('BORRADOR');
      // No resuelve fuentes: la edición sigue PENDIENTE, sin urlPdf.
      expect(normaEnBd?.edicionRegistroOficial?.estadoResolucionFuente).toBe(
        'PENDIENTE',
      );
      expect(normaEnBd?.edicionRegistroOficial?.urlPdf).toBeNull();

      // Reintento idéntico: creado=false, mismo lote, sin filas nuevas.
      const normasAntes = await prisma.norma.count();
      const reintento = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .set('Authorization', autorizacion)
        .send({
          urlPdf: URL_VALIDA,
          periodoEsperado: { anio: 2026, mes: 8 },
          sha256PdfObservado: SHA_VALIDO,
          versionExtractorObservada: VERSION_ACTUAL,
        });
      expect(reintento.status).toBe(201);
      expect(reintento.body.creado).toBe(false);
      expect(reintento.body.lote.id).toBe(loteId);
      expect(await prisma.norma.count()).toBe(normasAntes);

      // Mismo período con URL de PDF diferente: conflicto real en PostgreSQL
      // (la huella incluye la URL, aunque el contenido/entradas coincidan).
      const conflicto = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .set('Authorization', autorizacion)
        .send({
          urlPdf: `${URL_VALIDA}-otra`,
          periodoEsperado: { anio: 2026, mes: 8 },
          sha256PdfObservado: SHA_VALIDO,
          versionExtractorObservada: VERSION_ACTUAL,
        });
      expect(conflicto.status).toBe(409);
      expect(conflicto.body.message).toBe('EJECUCION_INGESTA_CONFLICTIVA');
      expect(await prisma.norma.count()).toBe(normasAntes);
    });

    it('EDITOR: 403 en ambos endpoints, sin invocar descarga ni escribir en PostgreSQL', async () => {
      const autorizacion = await autorizacionDe(CORREO_EDITOR);
      const lotesAntes = await prisma.loteIngestaRegistroOficial.count();
      const llamadasAntes = descargadorFake.llamadas.length;

      const analizar = await request(servidor())
        .post('/ingesta/registro-oficial/indices/analizar')
        .set('Authorization', autorizacion)
        .send({ urlPdf: URL_VALIDA, periodoEsperado: { anio: 2026, mes: 9 } });
      const confirmar = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .set('Authorization', autorizacion)
        .send({
          urlPdf: URL_VALIDA,
          periodoEsperado: { anio: 2026, mes: 9 },
          sha256PdfObservado: SHA_VALIDO,
          versionExtractorObservada: VERSION_ACTUAL,
        });

      expect(analizar.status).toBe(403);
      expect(confirmar.status).toBe(403);
      expect(descargadorFake.llamadas.length).toBe(llamadasAntes);
      expect(await prisma.loteIngestaRegistroOficial.count()).toBe(lotesAntes);
    });

    it('sin token: 401 en ambos endpoints', async () => {
      const analizar = await request(servidor())
        .post('/ingesta/registro-oficial/indices/analizar')
        .send({ urlPdf: URL_VALIDA, periodoEsperado: { anio: 2026, mes: 10 } });
      const confirmar = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .send({
          urlPdf: URL_VALIDA,
          periodoEsperado: { anio: 2026, mes: 10 },
          sha256PdfObservado: SHA_VALIDO,
          versionExtractorObservada: VERSION_ACTUAL,
        });
      expect(analizar.status).toBe(401);
      expect(confirmar.status).toBe(401);
    });
  },
);

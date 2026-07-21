import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerTestDatabaseUrlDesdeEntorno } from '../prisma/validar-url-base-datos-test';

// Seed compartido con el script `prisma:seed` (única fuente de verdad).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sembrar, CONTRASENA_SEMILLA } = require('../../scripts/seed-prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aplicarChecksPrisma } = require('../../scripts/aplicar-checks-prisma');

const CORREO_SUPERADMIN = 'superadmin@test.com';
const CORREO_EDITOR = 'editor@test.com';
const CORREO_ADMIN = 'admin@test.com';

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

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

describirPrisma(
  'Ingesta Registro Oficial (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let persistenciaPrevia: string | undefined;
    let databaseUrlPrevia: string | undefined;

    const corrida = randomUUID().slice(0, 8);
    const tipoNorma = `Acuerdo-${corrida}`;
    const numeroEdicionManual =
      1_000_000_000 + (Number.parseInt(corrida, 16) % 1_000_000_000);
    const urlEdicionManual =
      `https://www.registroficial.gob.ec/edicion-manual-${corrida}.pdf`;

    function entradaValida(overrides: Record<string, unknown> = {}) {
      return {
        posicion: 0,
        tipo: tipoNorma,
        numero: '123',
        titulo: `Acuerdo ${corrida} de Prueba`,
        institucion: 'Ministerio de Prueba',
        seccion: 'Función Ejecutiva',
        publicacion: {
          tipo: 'RO',
          numero: 500,
          fecha: '2026-05-02',
        },
        segmentoCrudo: `Acuerdo ${corrida}: disposición de prueba`,
        metadataExtraccion: { filaPdf: 4 },
        advertencias: [],
        confianza: 0.95,
        ...overrides,
      };
    }

    function cuerpoLoteValido(overrides: Record<string, unknown> = {}) {
      return {
        periodo: { anio: 2026, mes: 5 },
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        versionExtractor: '1.0.0',
        entradasDetectadas: [entradaValida()],
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
        where: {
          periodoAnio: 2026,
          periodoMes: { in: [5, 6] },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AppModule } = require('../app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
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

    it('flujo completo: ingesta, idempotencia mensual, conflicto y consulta', async () => {
      const autorizacionSuperadmin = await autorizacionDe(CORREO_SUPERADMIN);

      const entradasBase = [
        entradaValida(),
        entradaValida({
          posicion: 1,
          numero: '456',
          advertencias: ['FILA_PDF_CORTADA'],
        }),
        entradaValida({
          posicion: 2,
          titulo: '   ',
          numero: '789',
        }),
      ];

      const primera = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', autorizacionSuperadmin)
        .send(cuerpoLoteValido({ entradasDetectadas: entradasBase }));

      expect(primera.status).toBe(201);
      const loteId = primera.body.lote.id as string;
      expect(primera.body.lote.totalEntradasDetectadas).toBe(3);
      expect(primera.body.lote.totalConAdvertencias).toBe(2);
      expect(primera.body.creado).toBe(true);
      expect(primera.body.lote).not.toHaveProperty('entradasDetectadas');

      const loteEnBd = await prisma.loteIngestaRegistroOficial.findUnique({
        where: {
          periodoAnio_periodoMes: { periodoAnio: 2026, periodoMes: 5 },
        },
      });
      expect(loteEnBd).not.toBeNull();
      expect(loteEnBd?.id).toBe(loteId);
      expect(loteEnBd).not.toHaveProperty('fuente');
      expect(loteEnBd).not.toHaveProperty('creadoPorUsuarioId');
      expect(loteEnBd?.versionExtractor).toBe('1.0.0');
      expect(loteEnBd?.urlResumenMensualRegistroOficial).toBe(
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      );

      const entradasEnBd =
        await prisma.entradaDetectadaRegistroOficial.findMany({
          where: { loteId },
          orderBy: { posicion: 'asc' },
        });
      expect(entradasEnBd).toHaveLength(3);
      expect(entradasEnBd[0].metadataExtraccion).toEqual({ filaPdf: 4 });
      expect(entradasEnBd[2].normaId).toBeTruthy();

      const normaCreadaId = entradasEnBd[0].normaId;
      const normaEnBd = await prisma.norma.findUnique({
        where: { id: normaCreadaId },
        include: { edicionRegistroOficial: true },
      });
      expect(normaEnBd?.estadoEditorial).toBe('BORRADOR');
      expect(normaEnBd?.estadoJuridico).toBe('VIGENTE');
      expect(normaEnBd?.fechaPublicacionEnSistema).toBeNull();
      expect(normaEnBd?.contenido).toEqual([]);
      expect(normaEnBd?.edicionRegistroOficialId).toBeTruthy();
      expect(normaEnBd).not.toHaveProperty('fuente');
      expect(normaEnBd).not.toHaveProperty('tipoPublicacionRegistroOficial');
      expect(normaEnBd).not.toHaveProperty('numeroPublicacionRegistroOficial');
      // La triple y la fuente pertenecen a la edición consultada por relación.
      const edicionAsociada = normaEnBd?.edicionRegistroOficial;
      expect(edicionAsociada).not.toBeNull();
      expect(edicionAsociada?.tipoPublicacionRegistroOficial).toBe('RO');
      expect(edicionAsociada?.numeroPublicacionRegistroOficial).toBe(500);
      expect(edicionAsociada?.estadoResolucionFuente).toBe('PENDIENTE');
      expect(edicionAsociada?.urlPdf).toBeNull();

      // Sin título detectado: la norma queda con título vacío, sin
      // placeholders artificiales.
      const normaSinTitulo = await prisma.norma.findUnique({
        where: { id: entradasEnBd[2].normaId },
      });
      expect(normaSinTitulo?.estadoEditorial).toBe('BORRADOR');
      expect(normaSinTitulo?.titulo).toBe('');

      const normasAntes = await prisma.norma.count();
      const reenvio = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', autorizacionSuperadmin)
        .send(cuerpoLoteValido({ entradasDetectadas: entradasBase }));
      expect(reenvio.status).toBe(201);
      expect(reenvio.body.creado).toBe(false);
      expect(reenvio.body.lote.id).toBe(loteId);
      expect(await prisma.norma.count()).toBe(normasAntes);

      const conflicto = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', autorizacionSuperadmin)
        .send(
          cuerpoLoteValido({
            entradasDetectadas: [
              entradaValida({ titulo: 'Contenido cambiado' }),
            ],
          }),
        );
      expect(conflicto.status).toBe(409);
      expect(conflicto.body.message).toBe('EJECUCION_INGESTA_CONFLICTIVA');

      // Los lotes son control técnico: solo el superadmin los consulta.
      const lotes = await request(servidor())
        .get('/ingesta/registro-oficial/lotes')
        .set('Authorization', autorizacionSuperadmin);
      expect(lotes.status).toBe(200);
      const idsLotes = (lotes.body as Array<{ id: string }>).map((l) => l.id);
      expect(idsLotes).toContain(loteId);
      expect(lotes.body[0]).not.toHaveProperty('entradasDetectadas');
      expect(lotes.body[0]).not.toHaveProperty('creadoPorUsuarioId');

      const loteCompleto = await request(servidor())
        .get(`/ingesta/registro-oficial/lotes/${loteId}`)
        .set('Authorization', autorizacionSuperadmin);
      expect(loteCompleto.status).toBe(200);
      expect(loteCompleto.body.entradasDetectadas).toHaveLength(3);
      expect(loteCompleto.body.entradasDetectadas[2].resultadoDeteccion).toBe(
        'ENTRADA_CON_ADVERTENCIAS',
      );

      const autorizacionEditor = await autorizacionDe(CORREO_EDITOR);
      const editorIngesta = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', autorizacionEditor)
        .send(cuerpoLoteValido());
      expect(editorIngesta.status).toBe(403);

      const editorLotes = await request(servidor())
        .get('/ingesta/registro-oficial/lotes')
        .set('Authorization', autorizacionEditor);
      expect(editorLotes.status).toBe(403);

      const autorizacionAdmin = await autorizacionDe(CORREO_ADMIN);
      const adminLotes = await request(servidor())
        .get('/ingesta/registro-oficial/lotes')
        .set('Authorization', autorizacionAdmin);
      expect(adminLotes.status).toBe(403);

      const sinToken = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .send(cuerpoLoteValido());
      expect(sinToken.status).toBe(401);
    });

    it('flujo editorial: lista BORRADOR, detalle con origen, corrección y publicación múltiple', async () => {
      const autorizacionSuperadmin = await autorizacionDe(CORREO_SUPERADMIN);
      const autorizacionEditor = await autorizacionDe(CORREO_EDITOR);

      // Entrada con detección incompleta: sin fuente ni fechas.
      const ingesta = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', autorizacionSuperadmin)
        .send(
          cuerpoLoteValido({
            periodo: { anio: 2026, mes: 6 },
            entradasDetectadas: [
              entradaValida({
                numero: `77-${corrida}`,
                publicacion: null,
                segmentoCrudo: `Segmento editorial ${corrida}`,
              }),
            ],
          }),
      );
      expect(ingesta.status).toBe(201);
      const loteEditorial = await request(servidor())
        .get(`/ingesta/registro-oficial/lotes/${ingesta.body.lote.id}`)
        .set('Authorization', autorizacionSuperadmin);
      expect(loteEditorial.status).toBe(200);
      const normaId = loteEditorial.body.entradasDetectadas[0].normaId as string;

      // Lista editorial: el editor ve el borrador sin campos técnicos.
      const lista = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', autorizacionEditor);
      expect(lista.status).toBe(200);
      const enLista = (lista.body as Array<Record<string, unknown>>).find(
        (norma) => norma.id === normaId,
      );
      expect(enLista).toBeDefined();
      expect(enLista?.edicionesRegistroOficial).toEqual([]);
      expect(enLista).not.toHaveProperty('edicionRegistroOficialId');
      expect(enLista).not.toHaveProperty('fuente');
      expect(enLista).not.toHaveProperty('fechaPublicacionOficial');
      expect(enLista).not.toHaveProperty('tipoPublicacionRegistroOficial');
      expect(enLista?.origenRegistroOficial).toEqual({
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        segmentoCrudo: `Segmento editorial ${corrida}`,
      });

      // Detalle con la referencia mínima al origen Registro Oficial.
      const detalle = await request(servidor())
        .get(`/normas/${normaId}`)
        .set('Authorization', autorizacionEditor);
      expect(detalle.status).toBe(200);
      expect(detalle.body.origenRegistroOficial).toEqual({
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        segmentoCrudo: `Segmento editorial ${corrida}`,
      });

      // Sin edición asociada la publicación falla con razón explícita.
      const publicacionPrematura = await request(servidor())
        .post(`/normas/${normaId}/publicar`)
        .set('Authorization', autorizacionEditor)
        .send({});
      expect(publicacionPrematura.status).toBe(409);
      expect(publicacionPrematura.body.message).toBe(
        'EDICION_REGISTRO_OFICIAL_REQUERIDA',
      );

      // PATCH /normas solo corrige datos propios de la norma.
      const correccion = await request(servidor())
        .patch(`/normas/${normaId}`)
        .set('Authorization', autorizacionEditor)
        .send({
          fechaExpedicion: '2026-04-30',
        });
      expect(correccion.status).toBe(200);
      expect(correccion.body.estadoEditorial).toBe('BORRADOR');
      expect(correccion.body.edicionesRegistroOficial).toEqual([]);
      expect(correccion.body).not.toHaveProperty('edicionRegistroOficialId');
      expect(correccion.body).not.toHaveProperty('fuente');

      // La edición se crea MANUAL mediante su endpoint y luego se asocia por
      // FK; la fuente se proyecta en la norma sin persistirse en ella.
      const creacionEdicion = await request(servidor())
        .post('/ediciones-registro-oficial')
        .set('Authorization', autorizacionEditor)
        .send({
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: numeroEdicionManual,
          fechaPublicacionOficial: '2026-05-03',
          urlPdf: urlEdicionManual,
        });
      expect(creacionEdicion.status).toBe(201);
      expect(creacionEdicion.body.estadoResolucionFuente).toBe('MANUAL');
      expect(creacionEdicion.body.urlPdf).toBe(urlEdicionManual);
      const edicionId = creacionEdicion.body.id as string;

      const asociacion = await request(servidor())
        .patch(`/normas/${normaId}/edicion-registro-oficial`)
        .set('Authorization', autorizacionEditor)
        .send({ edicionRegistroOficialId: edicionId });
      expect(asociacion.status).toBe(200);
      expect(asociacion.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: edicionId,
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: numeroEdicionManual,
          fechaPublicacionOficial: '2026-05-03',
          fuente: urlEdicionManual,
        }),
      ]);
      expect(asociacion.body).not.toHaveProperty('edicionRegistroOficialId');
      expect(asociacion.body).not.toHaveProperty('fuente');

      // Publicación múltiple parcial: la norma corregida se publica y la
      // inexistente se reporta sin bloquear.
      const publicacion = await request(servidor())
        .post('/normas/publicar')
        .set('Authorization', autorizacionEditor)
        .send({ normaIds: [normaId, `norma-inexistente-${corrida}`] });
      expect(publicacion.status).toBe(200);
      expect(publicacion.body.resultados).toEqual([
        { normaId, publicada: true, estadoEditorial: 'PUBLICADA' },
        {
          normaId: `norma-inexistente-${corrida}`,
          publicada: false,
          razon: 'NORMA_NO_ENCONTRADA',
        },
      ]);

      const normaPublicada = await prisma.norma.findUnique({
        where: { id: normaId },
        include: { edicionRegistroOficial: true },
      });
      expect(normaPublicada?.estadoEditorial).toBe('PUBLICADA');
      expect(normaPublicada?.fechaPublicacionEnSistema).not.toBeNull();
      expect(normaPublicada?.edicionRegistroOficialId).toBe(edicionId);
      expect(normaPublicada).not.toHaveProperty('fuente');
      expect(normaPublicada?.edicionRegistroOficial).toEqual(
        expect.objectContaining({
          id: edicionId,
          urlPdf: urlEdicionManual,
          estadoResolucionFuente: 'MANUAL',
        }),
      );

      const listaPublicadas = await request(servidor())
        .get('/normas?estadoEditorial=PUBLICADA')
        .set('Authorization', autorizacionSuperadmin);
      expect(listaPublicadas.status).toBe(200);
      const publicadaEnLista = (
        listaPublicadas.body as Array<Record<string, unknown>>
      ).find((norma) => norma.id === normaId);
      expect(publicadaEnLista?.origenRegistroOficial).toEqual({
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        segmentoCrudo: `Segmento editorial ${corrida}`,
      });

      // ADMINISTRADOR fuera del flujo editorial.
      const autorizacionAdmin = await autorizacionDe(CORREO_ADMIN);
      const adminLista = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', autorizacionAdmin);
      expect(adminLista.status).toBe(403);
      const adminPublicar = await request(servidor())
        .post('/normas/publicar')
        .set('Authorization', autorizacionAdmin)
        .send({ normaIds: [normaId] });
      expect(adminPublicar.status).toBe(403);
    });
  },
);

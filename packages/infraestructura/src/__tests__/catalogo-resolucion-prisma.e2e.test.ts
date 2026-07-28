import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
const CORREO_SUSCRIPTOR = 'suscriptor@test.com';

const DOMINIO_PDF = 'cdn.oficial.test';

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

function restaurarVariableEntorno(nombre: string, valorPrevio: string | undefined) {
  if (valorPrevio === undefined) {
    delete process.env[nombre];
    return;
  }
  process.env[nombre] = valorPrevio;
}

/**
 * E2E determinista de la resolución automática con el catálogo HABILITADO,
 * construido realmente por `NormasPrismaModule` (persistencia Prisma). El
 * catálogo apunta a un servidor HTTP local controlado —nunca al sitio oficial—
 * configurado por variables de entorno de test. Verifica la persistencia real:
 * una respuesta válida resuelve la edición; una respuesta no confiable la
 * conserva PENDIENTE (fail-closed).
 */
describirPrisma(
  'Resolución con catálogo habilitado (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let servidorCatalogo: Server;

    const previos: Record<string, string | undefined> = {};

    const corrida = randomUUID().replace(/-/g, '').slice(0, 6);
    const base = (Number.parseInt(corrida, 16) % 800_000) + 1_000;
    const numeroResuelta = base;
    const numeroInvalida = base + 1;
    const urlPdfResuelta = `https://${DOMINIO_PDF}/ediciones/ro-${numeroResuelta}.pdf`;

    function tarjeta(numero: number, fechaTexto: string, pdf: string): string {
      return `<article>
        <h2 class="card__title_post_imagen">Registro Oficial Nº ${numero}</h2>
        <div class="txt_fecha_post_imagen">${fechaTexto}\nQuito</div>
        <a class="cta_post_imagen" href="${pdf}">Descargar</a>
      </article>`;
    }

    function cuerpoNorma(numero: number, fechaOficial: string) {
      return {
        numero: `N-${numero}`,
        titulo: `Ley Orgánica ${numero}`,
        contenido: [],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: 'VIGENTE',
        fechaExpedicion: '2026-05-01',
        fechaPublicacionOficial: fechaOficial,
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: numero,
      };
    }

    async function autorizacionDe(correo: string): Promise<string> {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo, contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      return `Bearer ${login.body.accessToken}`;
    }

    async function registrarEdicionPendiente(
      numero: number,
      fechaOficial: string,
    ): Promise<string> {
      const autorizacionEditor = await autorizacionDe(CORREO_EDITOR);
      const respuesta = await request(app.getHttpServer())
        .post('/normas')
        .set('Authorization', autorizacionEditor)
        .send(cuerpoNorma(numero, fechaOficial));
      expect(respuesta.status).toBe(201);
      return respuesta.body.edicionesRegistroOficial[0].id as string;
    }

    beforeAll(async () => {
      // Servidor de catálogo local: la respuesta depende del mes consultado
      // (nunca del sitio oficial). Mes 5 -> card válida; mes 6 -> mantenimiento.
      servidorCatalogo = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString());
          const mesId = form.get('mes_id');
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          if (mesId === '1983') {
            res.end(
              `<section>${tarjeta(numeroResuelta, 'lunes, 4 mayo 2026', urlPdfResuelta)}</section>`,
            );
          } else {
            res.end('<html><body>Servicio temporalmente en mantenimiento</body></html>');
          }
        });
      });
      await new Promise<void>((resolve) => servidorCatalogo.listen(0, resolve));
      const { port } = servidorCatalogo.address() as AddressInfo;

      for (const clave of [
        'PERSISTENCIA',
        'DATABASE_URL',
        'CATALOGO_REGISTRO_OFICIAL_HABILITADO',
        'CATALOGO_REGISTRO_OFICIAL_BASE_URL',
        'CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF',
      ]) {
        previos[clave] = process.env[clave];
      }
      process.env.PERSISTENCIA = 'prisma';
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.CATALOGO_REGISTRO_OFICIAL_HABILITADO = 'true';
      process.env.CATALOGO_REGISTRO_OFICIAL_BASE_URL = `http://localhost:${port}`;
      process.env.CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF = DOMINIO_PDF;

      prisma = new PrismaService();
      await prisma.$connect();
      await aplicarChecksPrisma(prisma);
      await sembrar(prisma);

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
      await new Promise<void>((resolve) =>
        servidorCatalogo.close(() => resolve()),
      );
      for (const [clave, valor] of Object.entries(previos)) {
        restaurarVariableEntorno(clave, valor);
      }
    });

    it('resuelve una edición PENDIENTE contra el catálogo local y persiste RESUELTA', async () => {
      const edicionId = await registrarEdicionPendiente(
        numeroResuelta,
        '2026-05-04',
      );

      const respuesta = await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(CORREO_SUPERADMIN))
        .send({ edicionIds: [edicionId] });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.resueltas).toBe(1);

      const enBd = await prisma.edicionRegistroOficial.findUnique({
        where: { id: edicionId },
      });
      expect(enBd?.estadoResolucionFuente).toBe('RESUELTA');
      expect(enBd?.urlPdf).toBe(urlPdfResuelta);
    });

    it('una respuesta no confiable conserva la edición PENDIENTE con urlPdf null (fail-closed)', async () => {
      const edicionId = await registrarEdicionPendiente(
        numeroInvalida,
        '2026-06-04',
      );

      const respuesta = await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(CORREO_SUPERADMIN))
        .send({ edicionIds: [edicionId] });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.resueltas).toBe(0);
      expect(respuesta.body.noEncontradas).toBe(0);
      // La página de mantenimiento no es un fallo transitorio: es una
      // respuesta no interpretable y el contrato conserva esa razón.
      expect(respuesta.body.erroresCatalogo).toBe(1);
      expect(respuesta.body.erroresPorRazon).toEqual({
        CATALOGO_TEMPORALMENTE_NO_DISPONIBLE: 0,
        RESPUESTA_CATALOGO_INVALIDA: 1,
        COBERTURA_CATALOGO_NO_DISPONIBLE: 0,
        BUSQUEDA_CATALOGO_INCOMPLETA: 0,
      });
      expect(respuesta.body).not.toHaveProperty('erroresTransitorios');

      const enBd = await prisma.edicionRegistroOficial.findUnique({
        where: { id: edicionId },
      });
      expect(enBd?.estadoResolucionFuente).toBe('PENDIENTE');
      expect(enBd?.urlPdf).toBeNull();
    });

    it('rechaza edicionIds y limite simultáneos (400 SOLICITUD_INVALIDA) sin modificar la edición', async () => {
      const edicionId = await registrarEdicionPendiente(
        numeroInvalida + 1,
        '2026-05-04',
      );

      const respuesta = await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(CORREO_SUPERADMIN))
        .send({ edicionIds: [edicionId], limite: 1 });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toBe('SOLICITUD_INVALIDA');

      const enBd = await prisma.edicionRegistroOficial.findUnique({
        where: { id: edicionId },
      });
      expect(enBd?.estadoResolucionFuente).toBe('PENDIENTE');
      expect(enBd?.urlPdf).toBeNull();
    });

    it('permisos: SUPERADMINISTRADOR permitido; EDITOR/ADMINISTRADOR/SUSCRIPTOR 403; sin token 401', async () => {
      await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(CORREO_SUPERADMIN))
        .send({ edicionIds: [`inexistente-${corrida}`] })
        .expect(200);

      for (const correo of [CORREO_EDITOR, CORREO_ADMIN, CORREO_SUSCRIPTOR]) {
        await request(app.getHttpServer())
          .post('/ediciones-registro-oficial/resolver-pendientes')
          .set('Authorization', await autorizacionDe(correo))
          .send({})
          .expect(403);
      }

      await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .send({})
        .expect(401);
    });
  },
);

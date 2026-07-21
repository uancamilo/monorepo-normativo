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

const CORREO_EDITOR = 'editor@test.com';
const CORREO_SUPERADMIN = 'superadmin@test.com';
const CORREO_ADMIN = 'admin@test.com';
const CORREO_SUSCRIPTOR = 'suscriptor@test.com';
const sufijoEdicion = randomUUID().slice(0, 8);
const numeroEdicion =
  1_000_000_000 + (Number.parseInt(sufijoEdicion, 16) % 1_000_000_000);
const urlPdfEdicion =
  `https://www.registroficial.gob.ec/norma-prisma-${sufijoEdicion}.pdf`;

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

function restaurarVariableEntorno(nombre: string, valorPrevio: string | undefined) {
  if (valorPrevio === undefined) {
    delete process.env[nombre];
    return;
  }

  process.env[nombre] = valorPrevio;
}

function cuerpoNormaValido(overrides: Record<string, unknown> = {}) {
  return {
    numero: '123',
    titulo: 'Ley Orgánica de Prueba (Prisma)',
    contenido: [],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: 'VIGENTE',
    fechaExpedicion: '2025-01-01',
    fechaPublicacionOficial: '2025-01-02',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: numeroEdicion,
    ...overrides,
  };
}

describirPrisma(
  'Normas (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let persistenciaPrevia: string | undefined;
    let databaseUrlPrevia: string | undefined;

    async function autorizacionDe(correo: string): Promise<string> {
      // Flujo real de Fase 4B/4C: el token sale de POST /auth/login contra los
      // usuarios seed (credenciales scrypt en PostgreSQL).
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo, contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      return `Bearer ${login.body.accessToken}`;
    }

    beforeAll(async () => {
      // Fuerza el selector a Prisma solo para este archivo; se restaura al final
      // para no contaminar otros archivos de test dentro del mismo worker.
      persistenciaPrevia = process.env.PERSISTENCIA;
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.PERSISTENCIA = 'prisma';
      process.env.DATABASE_URL = testDatabaseUrl;

      prisma = new PrismaService();
      await prisma.$connect();
      await aplicarChecksPrisma(prisma);
      await sembrar(prisma);

      // AppModule se carga tras fijar PERSISTENCIA=prisma para que use el módulo Prisma.
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

    it('flujo HTTP completo contra Prisma: registrar -> 403 -> publicar -> consultar -> verificar en BD', async () => {
      // 2-3. POST /normas como editor -> 201 y BORRADOR.
      const registro = await request(servidor())
        .post('/normas')
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send(cuerpoNormaValido());
      expect(registro.status).toBe(201);
      expect(registro.body.estadoEditorial).toBe('BORRADOR');
      const normaId: string = registro.body.id;
      expect(typeof normaId).toBe('string');
      expect(normaId.length).toBeGreaterThan(0);
      expect(registro.body.contenido).toEqual([]);
      expect(registro.body).not.toHaveProperty('edicionRegistroOficialId');
      const edicionId: string = registro.body.edicionesRegistroOficial[0].id;
      expect(edicionId).toEqual(expect.any(String));

      // 4. GET contenido como suscriptor antes de publicar -> 403.
      const consultaAntes = await request(servidor())
        .get(`/normas/${normaId}/contenido`)
        .set('Authorization', await autorizacionDe(CORREO_SUSCRIPTOR));
      expect(consultaAntes.status).toBe(403);

      // La fuente pertenece a la edición. La corrección manual deja la edición
      // en MANUAL y habilita la publicación de la norma asociada.
      const correccionFuente = await request(servidor())
        .patch(`/ediciones-registro-oficial/${edicionId}/fuente`)
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({ urlPdf: urlPdfEdicion });
      expect(correccionFuente.status).toBe(200);
      expect(correccionFuente.body.estadoResolucionFuente).toBe('MANUAL');
      expect(correccionFuente.body.urlPdf).toBe(urlPdfEdicion);

      // 5. POST publicar como editor -> 200 con fechaPublicacionEnSistema.
      const publicacion = await request(servidor())
        .post(`/normas/${normaId}/publicar`)
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({ fechaPublicacionEnSistema: '2026-06-29T00:00:00.000Z' });
      expect(publicacion.status).toBe(200);
      expect(publicacion.body.estadoEditorial).toBe('PUBLICADA');
      expect(publicacion.body.fechaPublicacionEnSistema).toBe(
        '2026-06-29T00:00:00.000Z',
      );

      // 6. GET contenido como suscriptor tras publicar -> 200, con fuente,
      //    sin fechaPublicacionEnSistema ni estadoEditorial.
      const consultaDespues = await request(servidor())
        .get(`/normas/${normaId}/contenido`)
        .set('Authorization', await autorizacionDe(CORREO_SUSCRIPTOR));
      expect(consultaDespues.status).toBe(200);
      expect(consultaDespues.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: edicionId,
          fuente: urlPdfEdicion,
        }),
      ]);
      expect(consultaDespues.body).not.toHaveProperty('fuente');
      expect(consultaDespues.body).not.toHaveProperty('fechaPublicacionEnSistema');
      expect(consultaDespues.body).not.toHaveProperty('estadoEditorial');

      // 7. Verificar en PostgreSQL que la norma existe y está PUBLICADA.
      const normaEnBd = await prisma.norma.findUnique({
        where: { id: normaId },
        include: { edicionRegistroOficial: true },
      });
      expect(normaEnBd).not.toBeNull();
      expect(normaEnBd?.estadoEditorial).toBe('PUBLICADA');
      expect(normaEnBd?.edicionRegistroOficialId).toBe(edicionId);
      expect(normaEnBd).not.toHaveProperty('fuente');
      expect(normaEnBd).not.toHaveProperty('tipoPublicacionRegistroOficial');
      expect(normaEnBd).not.toHaveProperty('numeroPublicacionRegistroOficial');
      expect(normaEnBd?.edicionRegistroOficial).toEqual(
        expect.objectContaining({
          id: edicionId,
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: numeroEdicion,
          urlPdf: urlPdfEdicion,
          estadoResolucionFuente: 'MANUAL',
        }),
      );

      // 8. Verificar que se persistió el evento de publicación.
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].tieneContenidoCompleto).toBe(false);
    });

    it('dos POST /normas/:id/publicar concurrentes contra Prisma: un 200, un 409 NORMA_YA_PUBLICADA, nunca 500', async () => {
      const registro = await request(servidor())
        .post('/normas')
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send(
          cuerpoNormaValido({
            titulo: 'Norma de publicación concurrente (Prisma)',
            numeroPublicacionRegistroOficial: numeroEdicion + 2,
          }),
        );
      expect(registro.status).toBe(201);
      const normaId: string = registro.body.id;
      const edicionId: string = registro.body.edicionesRegistroOficial[0].id;
      const correccionFuente = await request(servidor())
        .patch(`/ediciones-registro-oficial/${edicionId}/fuente`)
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({ urlPdf: urlPdfEdicion });
      expect(correccionFuente.status).toBe(200);
      const autorizacion = await autorizacionDe(CORREO_EDITOR);

      const respuestas = await Promise.all([
        request(servidor())
          .post(`/normas/${normaId}/publicar`)
          .set('Authorization', autorizacion)
          .send({}),
        request(servidor())
          .post(`/normas/${normaId}/publicar`)
          .set('Authorization', autorizacion)
          .send({}),
      ]);

      // La carrera se resuelve en la actualización condicionada: nunca un
      // error Prisma crudo ni un 500.
      const estados = respuestas.map((respuesta) => respuesta.status).sort();
      expect(estados).toEqual([200, 409]);
      const conflicto = respuestas.find(
        (respuesta) => respuesta.status === 409,
      );
      expect(conflicto?.body.message).toBe('NORMA_YA_PUBLICADA');

      const normaEnBd = await prisma.norma.findUnique({
        where: { id: normaId },
      });
      expect(normaEnBd?.estadoEditorial).toBe('PUBLICADA');
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId },
      });
      expect(eventos).toHaveLength(1);
    });

    it('reemplaza la principal atómicamente y filtra cambios no publicables para cualquier lector con suscripción', async () => {
      const registro = await request(servidor())
        .post('/normas')
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send(
          cuerpoNormaValido({
            titulo: 'Norma con cambio pendiente (Prisma)',
            numeroPublicacionRegistroOficial: numeroEdicion + 20,
          }),
        );
      expect(registro.status).toBe(201);
      const normaId = registro.body.id as string;
      const principalAnteriorId = registro.body.edicionesRegistroOficial[0]
        .id as string;

      const nuevaPrincipal = await request(servidor())
        .post('/ediciones-registro-oficial')
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: numeroEdicion + 21,
          fechaPublicacionOficial: '2026-07-16',
          urlPdf: `https://www.registroficial.gob.ec/principal-${sufijoEdicion}.pdf`,
        });
      expect(nuevaPrincipal.status).toBe(201);

      const cambio = await request(servidor())
        .patch(`/normas/${normaId}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({ edicionRegistroOficialId: nuevaPrincipal.body.id });
      expect(cambio.status).toBe(200);
      expect(cambio.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: nuevaPrincipal.body.id,
        }),
        expect.objectContaining({
          tipoRelacion: 'CAMBIO',
          id: principalAnteriorId,
          fuente: null,
        }),
      ]);
      expect(cambio.body).not.toHaveProperty('edicionRegistroOficialId');

      await expect(
        prisma.normaEdicionRegistroOficialCambio.findUnique({
          where: {
            normaId_edicionRegistroOficialId: {
              normaId,
              edicionRegistroOficialId: principalAnteriorId,
            },
          },
        }),
      ).resolves.not.toBeNull();

      const publicacion = await request(servidor())
        .post(`/normas/${normaId}/publicar`)
        .set('Authorization', await autorizacionDe(CORREO_EDITOR))
        .send({});
      expect(publicacion.status).toBe(200);

      const suscripcionAdminId = `suscripcion-admin-${sufijoEdicion}`;
      await prisma.suscripcion.create({
        data: {
          id: suscripcionAdminId,
          clienteId: `cliente-admin-${sufijoEdicion}`,
          cantidadMaximaUsuarios: 1,
          estado: 'ACTIVA',
          fechaInicio: new Date('2000-01-01T00:00:00.000Z'),
          fechaFin: new Date('2100-01-01T00:00:00.000Z'),
          correosHabilitados: {
            create: {
              id: `correo-admin-${sufijoEdicion}`,
              correoNormalizado: CORREO_ADMIN,
            },
          },
        },
      });

      try {
        for (const correo of [CORREO_SUSCRIPTOR, CORREO_ADMIN]) {
          const contenido = await request(servidor())
            .get(`/normas/${normaId}/contenido`)
            .set('Authorization', await autorizacionDe(correo));
          expect(contenido.status).toBe(200);
          expect(contenido.body.edicionesRegistroOficial).toEqual([
            expect.objectContaining({
              tipoRelacion: 'PRINCIPAL',
              id: nuevaPrincipal.body.id,
              fuente: nuevaPrincipal.body.urlPdf,
            }),
          ]);
          expect(contenido.body).not.toHaveProperty(
            'estadoResolucionFuente',
          );
          expect(contenido.body).not.toHaveProperty('origenRegistroOficial');
        }
      } finally {
        await prisma.suscripcion.delete({ where: { id: suscripcionAdminId } });
      }
    });

    it('resolver-pendientes sin catálogo real devuelve 503 y conserva la edición PENDIENTE', async () => {
      const edicionId = `edicion-catalogo-no-disponible-${sufijoEdicion}`;
      await prisma.edicionRegistroOficial.create({
        data: {
          id: edicionId,
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: numeroEdicion + 1,
          fechaPublicacionOficial: new Date('2026-07-15T00:00:00.000Z'),
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        },
      });

      const respuesta = await request(servidor())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(CORREO_SUPERADMIN));

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.message).toBe('CATALOGO_NO_DISPONIBLE');
      await expect(
        prisma.edicionRegistroOficial.findUnique({ where: { id: edicionId } }),
      ).resolves.toEqual(
        expect.objectContaining({
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        }),
      );
    });
  },
);

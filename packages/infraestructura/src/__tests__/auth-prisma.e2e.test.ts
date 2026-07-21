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
const CORREO_SUSCRIPTOR = 'suscriptor@test.com';

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

function restaurarVariableEntorno(nombre: string, valorPrevio: string | undefined) {
  if (valorPrevio === undefined) {
    delete process.env[nombre];
    return;
  }

  process.env[nombre] = valorPrevio;
}

describirPrisma(
  'Auth (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let persistenciaPrevia: string | undefined;
    let databaseUrlPrevia: string | undefined;

    async function iniciarSesion(correo: string, contrasena: string) {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo, contrasena });
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

      // AppModule se carga tras fijar PERSISTENCIA=prisma para que use los
      // módulos Prisma (normas + auth).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AppModule } = require('../app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      // Restaura credenciales incluso si el test de cambio de contraseña falla
      // después de persistir el hash nuevo.
      if (prisma) {
        await sembrar(prisma);
      }
      await prisma?.usuario.deleteMany({ where: { id: 'usuario-sin-password' } });
      await app?.close();
      await prisma?.$disconnect();
      restaurarVariableEntorno('PERSISTENCIA', persistenciaPrevia);
      restaurarVariableEntorno('DATABASE_URL', databaseUrlPrevia);
    });

    it('el usuario seed tiene password_hash scrypt en PostgreSQL', async () => {
      const usuario = await prisma.usuario.findUnique({
        where: { correoNormalizado: CORREO_EDITOR },
      });

      expect(usuario).not.toBeNull();
      expect(usuario?.passwordHash?.startsWith('scrypt:v1:')).toBe(true);
    });

    it('login seed -> token -> registrar -> publicar -> consultar', async () => {
      const loginEditor = await iniciarSesion(CORREO_EDITOR, CONTRASENA_SEMILLA);
      expect(loginEditor.status).toBe(200);
      expect(loginEditor.body.tokenType).toBe('Bearer');
      const autorizacionEditor = `Bearer ${loginEditor.body.accessToken}`;
      const sufijo = randomUUID().slice(0, 8);
      const numeroEdicion = 1_000_000_000 + (Number.parseInt(sufijo, 16) % 1_000_000_000);
      const urlPdf = `https://www.registroficial.gob.ec/norma-login-prisma-${sufijo}.pdf`;

      const registro = await request(app.getHttpServer())
        .post('/normas')
        .set('Authorization', autorizacionEditor)
        .send({
          numero: '456',
          titulo: 'Ley de Prueba (login Prisma)',
          contenido: ['Texto completo'],
          tipoNorma: 'Ley',
          institucionExpide: 'Asamblea Nacional',
          estadoJuridico: 'VIGENTE',
          fechaExpedicion: '2025-01-01',
          fechaPublicacionOficial: '2025-01-02',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: numeroEdicion,
        });
      expect(registro.status).toBe(201);
      const normaId: string = registro.body.id;
      expect(registro.body).not.toHaveProperty('edicionRegistroOficialId');
      const edicionId: string = registro.body.edicionesRegistroOficial[0].id;
      expect(edicionId).toEqual(expect.any(String));

      // Registrar la norma crea/reutiliza la edición PENDIENTE. La fuente se
      // corrige en la edición y queda MANUAL antes de publicar.
      const correccionFuente = await request(app.getHttpServer())
        .patch(`/ediciones-registro-oficial/${edicionId}/fuente`)
        .set('Authorization', autorizacionEditor)
        .send({ urlPdf });
      expect(correccionFuente.status).toBe(200);
      expect(correccionFuente.body.estadoResolucionFuente).toBe('MANUAL');
      expect(correccionFuente.body.urlPdf).toBe(urlPdf);

      const normaEnBd = await prisma.norma.findUnique({
        where: { id: normaId },
        include: { edicionRegistroOficial: true },
      });
      expect(normaEnBd?.contenido).toEqual(['Texto completo']);
      expect(normaEnBd?.edicionRegistroOficialId).toBe(edicionId);
      expect(normaEnBd?.edicionRegistroOficial).toEqual(
        expect.objectContaining({
          id: edicionId,
          urlPdf,
          estadoResolucionFuente: 'MANUAL',
        }),
      );

      const publicacion = await request(app.getHttpServer())
        .post(`/normas/${normaId}/publicar`)
        .set('Authorization', autorizacionEditor)
        .send({});
      expect(publicacion.status).toBe(200);
      expect(publicacion.body.estadoEditorial).toBe('PUBLICADA');

      const loginSuscriptor = await iniciarSesion(
        CORREO_SUSCRIPTOR,
        CONTRASENA_SEMILLA,
      );
      expect(loginSuscriptor.status).toBe(200);

      const consulta = await request(app.getHttpServer())
        .get(`/normas/${normaId}/contenido`)
        .set('Authorization', `Bearer ${loginSuscriptor.body.accessToken}`);
      expect(consulta.status).toBe(200);
      expect(consulta.body.id).toBe(normaId);
      expect(consulta.body).not.toHaveProperty('estadoEditorial');
      expect(consulta.body).not.toHaveProperty('fechaPublicacionEnSistema');
    });

    it('credenciales inválidas devuelven 401 genérico', async () => {
      const contrasenaIncorrecta = await iniciarSesion(CORREO_EDITOR, 'incorrecta');
      const correoInexistente = await iniciarSesion('nadie@test.com', 'incorrecta');

      expect(contrasenaIncorrecta.status).toBe(401);
      expect(correoInexistente.status).toBe(401);
      expect(contrasenaIncorrecta.body).toEqual(correoInexistente.body);
    });

    it('cambiar contraseña: 204, hash scrypt nuevo en DB, vieja falla y nueva funciona', async () => {
      const CORREO_ADMIN = 'admin@test.com';
      const NUEVA_CONTRASENA = 'nueva-contrasena-prisma-1';

      // Login con la contraseña actual funciona antes del cambio.
      const login = await iniciarSesion(CORREO_ADMIN, CONTRASENA_SEMILLA);
      expect(login.status).toBe(200);
      const hashAntes = (
        await prisma.usuario.findUnique({
          where: { correoNormalizado: CORREO_ADMIN },
        })
      )?.passwordHash;

      const cambio = await request(app.getHttpServer())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: NUEVA_CONTRASENA,
        });
      expect(cambio.status).toBe(204);
      expect(cambio.body).toEqual({});

      // El hash cambió en PostgreSQL y mantiene el formato scrypt:v1.
      const usuarioDespues = await prisma.usuario.findUnique({
        where: { correoNormalizado: CORREO_ADMIN },
      });
      expect(usuarioDespues?.passwordHash?.startsWith('scrypt:v1:')).toBe(true);
      expect(usuarioDespues?.passwordHash).not.toBe(hashAntes);

      const loginVieja = await iniciarSesion(CORREO_ADMIN, CONTRASENA_SEMILLA);
      expect(loginVieja.status).toBe(401);

      const loginNueva = await iniciarSesion(CORREO_ADMIN, NUEVA_CONTRASENA);
      expect(loginNueva.status).toBe(200);

      // Restaura la contraseña semilla para no contaminar otras suites.
      await sembrar(prisma);
      const loginRestaurado = await iniciarSesion(CORREO_ADMIN, CONTRASENA_SEMILLA);
      expect(loginRestaurado.status).toBe(200);
    });

    it('usuario sin password_hash no puede iniciar sesión', async () => {
      await prisma.usuario.upsert({
        where: { id: 'usuario-sin-password' },
        update: { passwordHash: null },
        create: {
          id: 'usuario-sin-password',
          nombre: 'Sin',
          apellido: 'Password',
          correoNormalizado: 'sin-password@test.com',
          rol: 'SUSCRIPTOR',
          passwordHash: null,
        },
      });

      const respuesta = await iniciarSesion(
        'sin-password@test.com',
        CONTRASENA_SEMILLA,
      );

      expect(respuesta.status).toBe(401);
    });
  },
);

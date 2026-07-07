import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
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
const CORREO_EDITOR_NUEVO = 'editor.creado.prisma@test.com';
const CONTRASENA_INICIAL = 'contrasena-inicial-larga';

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
  'Usuarios del sistema (e2e Prisma/PostgreSQL, requiere TEST_DATABASE_URL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let persistenciaPrevia: string | undefined;
    let databaseUrlPrevia: string | undefined;

    async function tokenDe(correo: string, contrasena: string): Promise<string> {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo, contrasena });
      expect(login.status).toBe(200);
      return login.body.accessToken as string;
    }

    beforeAll(async () => {
      persistenciaPrevia = process.env.PERSISTENCIA;
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.PERSISTENCIA = 'prisma';
      process.env.DATABASE_URL = testDatabaseUrl;

      try {
        const prismaCli = require.resolve('prisma/build/index.js');
        execFileSync(process.execPath, [prismaCli, 'db', 'push'], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: testDatabaseUrl },
          stdio: 'pipe',
        });
      } catch (error) {
        throw new Error(
          'No se pudo aplicar el schema en la base de test. ¿Está PostgreSQL arriba? ' +
            'Ejecuta: docker compose -f docker-compose.test.yml up -d. Detalle: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }

      prisma = new PrismaService();
      await prisma.$connect();
      await aplicarChecksPrisma(prisma);
      await sembrar(prisma);
      await prisma.usuario.deleteMany({
        where: { correoNormalizado: CORREO_EDITOR_NUEVO },
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
      await prisma?.usuario.deleteMany({
        where: { correoNormalizado: CORREO_EDITOR_NUEVO },
      });
      await app?.close();
      await prisma?.$disconnect();
      restaurarVariableEntorno('PERSISTENCIA', persistenciaPrevia);
      restaurarVariableEntorno('DATABASE_URL', databaseUrlPrevia);
    });

    it('superadmin crea editor: 201, DB consistente, login del creado y 409 en duplicado', async () => {
      const normasAntes = await prisma.norma.count();
      const suscripcionesAntes = await prisma.suscripcion.count();
      const correosHabilitadosAntes = await prisma.suscripcionCorreoHabilitado.count();

      const tokenSuperadmin = await tokenDe(CORREO_SUPERADMIN, CONTRASENA_SEMILLA);

      const creacion = await request(app.getHttpServer())
        .post('/usuarios/sistema')
        .set('Authorization', `Bearer ${tokenSuperadmin}`)
        .send({
          nombre: 'Editor',
          apellido: 'Creado',
          correo: '  Editor.Creado.Prisma@Test.COM ',
          rol: 'EDITOR',
          contrasenaInicial: CONTRASENA_INICIAL,
        });

      expect(creacion.status).toBe(201);
      expect(creacion.body.correo).toBe(CORREO_EDITOR_NUEVO);
      expect(creacion.body.rol).toBe('EDITOR');
      expect(creacion.body).not.toHaveProperty('passwordHash');

      // Verificación en PostgreSQL: correo normalizado, rol y hash scrypt.
      const enBd = await prisma.usuario.findUnique({
        where: { correoNormalizado: CORREO_EDITOR_NUEVO },
      });
      expect(enBd).not.toBeNull();
      expect(enBd?.rol).toBe('EDITOR');
      expect(enBd?.passwordHash?.startsWith('scrypt:v1:')).toBe(true);

      // El usuario creado puede iniciar sesión con la contraseña inicial.
      const loginCreado = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo: CORREO_EDITOR_NUEVO, contrasena: CONTRASENA_INICIAL });
      expect(loginCreado.status).toBe(200);

      // Duplicado de correo -> 409.
      const duplicado = await request(app.getHttpServer())
        .post('/usuarios/sistema')
        .set('Authorization', `Bearer ${tokenSuperadmin}`)
        .send({
          nombre: 'Otro',
          apellido: 'Editor',
          correo: CORREO_EDITOR_NUEVO,
          rol: 'EDITOR',
          contrasenaInicial: CONTRASENA_INICIAL,
        });
      expect(duplicado.status).toBe(409);

      // Sin efectos colaterales: normas, suscripciones y correos habilitados intactos.
      expect(await prisma.norma.count()).toBe(normasAntes);
      expect(await prisma.suscripcion.count()).toBe(suscripcionesAntes);
      expect(await prisma.suscripcionCorreoHabilitado.count()).toBe(
        correosHabilitadosAntes,
      );
    });
  },
);

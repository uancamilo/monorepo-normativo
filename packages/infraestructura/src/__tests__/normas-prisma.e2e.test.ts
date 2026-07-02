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
const { sembrar } = require('../../scripts/seed-prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aplicarChecksPrisma } = require('../../scripts/aplicar-checks-prisma');

const USUARIO_EDITOR = 'usuario-editor-1';
const USUARIO_SUSCRIPTOR = 'usuario-suscriptor-1';

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
    contenido: '',
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: 'https://www.registroficial.gob.ec/norma-prisma.pdf',
    estadoJuridico: 'VIGENTE',
    fechaExpedicion: '2025-01-01',
    fechaPublicacionOficial: '2025-01-02',
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

    beforeAll(async () => {
      // Fuerza el selector a Prisma solo para este archivo; se restaura al final
      // para no contaminar otros archivos de test dentro del mismo worker.
      persistenciaPrevia = process.env.PERSISTENCIA;
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.PERSISTENCIA = 'prisma';
      process.env.DATABASE_URL = testDatabaseUrl;

      // Asegura el schema sin borrar la base (`db push` no destructivo). El test usa
      // un id de norma único, por lo que no depende de una base recién vaciada.
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
        .set('x-usuario-id', USUARIO_EDITOR)
        .send(cuerpoNormaValido());
      expect(registro.status).toBe(201);
      expect(registro.body.estadoEditorial).toBe('BORRADOR');
      const normaId: string = registro.body.id;
      expect(typeof normaId).toBe('string');
      expect(normaId.length).toBeGreaterThan(0);

      // 4. GET contenido como suscriptor antes de publicar -> 403.
      const consultaAntes = await request(servidor())
        .get(`/normas/${normaId}/contenido`)
        .set('x-usuario-id', USUARIO_SUSCRIPTOR);
      expect(consultaAntes.status).toBe(403);

      // 5. POST publicar como editor -> 200 con fechaPublicacionEnSistema.
      const publicacion = await request(servidor())
        .post(`/normas/${normaId}/publicar`)
        .set('x-usuario-id', USUARIO_EDITOR)
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
        .set('x-usuario-id', USUARIO_SUSCRIPTOR);
      expect(consultaDespues.status).toBe(200);
      expect(consultaDespues.body.fuente).toBe(
        'https://www.registroficial.gob.ec/norma-prisma.pdf',
      );
      expect(consultaDespues.body).not.toHaveProperty('fechaPublicacionEnSistema');
      expect(consultaDespues.body).not.toHaveProperty('estadoEditorial');

      // 7. Verificar en PostgreSQL que la norma existe y está PUBLICADA.
      const normaEnBd = await prisma.norma.findUnique({ where: { id: normaId } });
      expect(normaEnBd).not.toBeNull();
      expect(normaEnBd?.estadoEditorial).toBe('PUBLICADA');

      // 8. Verificar que se persistió el evento de publicación.
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].tieneContenidoCompleto).toBe(false);
    });
  },
);

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { IniciarSesion } from '@normativo/aplicacion';
import { RolUsuario } from '@normativo/dominio';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositorioCredencialesUsuariosPrisma } from '../RepositorioCredencialesUsuariosPrisma';
import { ServicioHashContrasenas } from '../../autenticacion/hash-contrasenas';
import { obtenerTestDatabaseUrlDesdeEntorno } from '../../prisma/validar-url-base-datos-test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapSuperadmin } = require('../../../scripts/bootstrap-superadmin');

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

const PASSWORD_BOOTSTRAP = 'contrasena-inicial-superadmin';

function configuracionBootstrap(overrides: Record<string, string> = {}) {
  return {
    id: 'superadmin-bootstrap-test',
    nombre: 'Superadministrador',
    apellido: 'Inicial',
    correoNormalizado: 'bootstrap@ejemplo.com',
    password: PASSWORD_BOOTSTRAP,
    ...overrides,
  };
}

describirPrisma(
  'bootstrapSuperadmin (integración Prisma, requiere TEST_DATABASE_URL)',
  () => {
    let prisma: PrismaService;
    let databaseUrlPrevia: string | undefined;

    beforeAll(async () => {
      databaseUrlPrevia = process.env.DATABASE_URL;
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
    });

    beforeEach(async () => {
      await prisma.usuario.deleteMany({
        where: {
          id: { in: ['superadmin-bootstrap-test', 'otro-usuario-correo'] },
        },
      });
    });

    afterAll(async () => {
      await prisma?.usuario.deleteMany({
        where: {
          id: { in: ['superadmin-bootstrap-test', 'otro-usuario-correo'] },
        },
      });
      await prisma?.$disconnect();
      if (databaseUrlPrevia === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = databaseUrlPrevia;
      }
    });

    it('crea el SUPERADMINISTRADOR con password_hash scrypt', async () => {
      const resultado = await bootstrapSuperadmin(prisma, configuracionBootstrap());

      const usuario = await prisma.usuario.findUnique({
        where: { id: 'superadmin-bootstrap-test' },
      });

      expect(resultado.creado).toBe(true);
      expect(usuario?.rol).toBe('SUPERADMINISTRADOR');
      expect(usuario?.correoNormalizado).toBe('bootstrap@ejemplo.com');
      expect(usuario?.passwordHash?.startsWith('scrypt:v1:')).toBe(true);
    });

    it('es idempotente: la segunda corrida actualiza sin duplicar ni cambiar el id', async () => {
      await bootstrapSuperadmin(prisma, configuracionBootstrap());
      const primero = await prisma.usuario.findUnique({
        where: { id: 'superadmin-bootstrap-test' },
      });

      const resultado = await bootstrapSuperadmin(
        prisma,
        configuracionBootstrap({ password: 'otra-contrasena-nueva-larga' }),
      );
      const segundo = await prisma.usuario.findUnique({
        where: { id: 'superadmin-bootstrap-test' },
      });
      const total = await prisma.usuario.count({
        where: { correoNormalizado: 'bootstrap@ejemplo.com' },
      });

      expect(resultado.creado).toBe(false);
      expect(total).toBe(1);
      expect(segundo?.id).toBe(primero?.id);
      // El hash cambió (nueva contraseña y nueva salt).
      expect(segundo?.passwordHash).not.toBe(primero?.passwordHash);
    });

    it('falla explícitamente si el correo pertenece a otro usuario y no modifica nada', async () => {
      await prisma.usuario.create({
        data: {
          id: 'otro-usuario-correo',
          nombre: 'Otro',
          apellido: 'Usuario',
          correoNormalizado: 'bootstrap@ejemplo.com',
          rol: 'SUSCRIPTOR',
        },
      });

      await expect(
        bootstrapSuperadmin(prisma, configuracionBootstrap()),
      ).rejects.toThrow(/ya pertenece a otro usuario/);

      const otro = await prisma.usuario.findUnique({
        where: { id: 'otro-usuario-correo' },
      });
      const bootstrap = await prisma.usuario.findUnique({
        where: { id: 'superadmin-bootstrap-test' },
      });
      expect(otro?.rol).toBe('SUSCRIPTOR');
      expect(otro?.passwordHash).toBeNull();
      expect(bootstrap).toBeNull();
    });

    it('después del bootstrap el login (IniciarSesion) funciona con esas credenciales', async () => {
      await bootstrapSuperadmin(prisma, configuracionBootstrap());

      const iniciarSesion = new IniciarSesion({
        repositorioCredenciales: new RepositorioCredencialesUsuariosPrisma(prisma),
        verificadorContrasenas: new ServicioHashContrasenas(),
      });

      const exitoso = await iniciarSesion.ejecutar({
        correo: '  Bootstrap@Ejemplo.COM ',
        contrasena: PASSWORD_BOOTSTRAP,
      });
      const fallido = await iniciarSesion.ejecutar({
        correo: 'bootstrap@ejemplo.com',
        contrasena: 'incorrecta-larga-123',
      });

      expect(exitoso).toEqual({
        exitoso: true,
        usuario: {
          id: 'superadmin-bootstrap-test',
          rol: RolUsuario.SUPERADMINISTRADOR,
        },
      });
      expect(fallido).toEqual({
        exitoso: false,
        razon: 'CREDENCIALES_INVALIDAS',
      });
    });
  },
);

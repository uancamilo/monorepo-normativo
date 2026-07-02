import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoSuscripcion,
  Norma,
  RolUsuario,
} from '@normativo/dominio';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositorioUsuariosPrisma } from '../RepositorioUsuariosPrisma';
import { RepositorioNormasPrisma } from '../RepositorioNormasPrisma';
import { RepositorioSuscripcionesPrisma } from '../RepositorioSuscripcionesPrisma';
import { GeneradorIdsUuid } from '../GeneradorIdsUuid';
import { PublicadorEventosNormasPrisma } from '../PublicadorEventosNormasPrisma';
import { UnidadDeTrabajoPublicacionNormaPrisma } from '../UnidadDeTrabajoPublicacionNormaPrisma';
import { obtenerTestDatabaseUrlDesdeEntorno } from '../../prisma/validar-url-base-datos-test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aplicarChecksPrisma } = require('../../../scripts/aplicar-checks-prisma');

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

// GeneradorIdsUuid no depende de PostgreSQL: se prueba siempre, aunque no haya
// TEST_DATABASE_URL, para no ocultar regresiones detrás del gate de Prisma.
describe('GeneradorIdsUuid (no requiere PostgreSQL)', () => {
  it('genera strings no vacíos y distintos', () => {
    const generador = new GeneradorIdsUuid();

    const primero = generador.generar();
    const segundo = generador.generar();

    expect(primero.trim().length).toBeGreaterThan(0);
    expect(segundo.trim().length).toBeGreaterThan(0);
    expect(primero).not.toBe(segundo);
  });
});

describirPrisma(
  'Adaptadores Prisma/PostgreSQL (requiere TEST_DATABASE_URL)',
  () => {
    let prisma: PrismaService;
    let databaseUrlPrevia: string | undefined;

    beforeAll(async () => {
      // TEST_DATABASE_URL tiene prioridad y se propaga a DATABASE_URL para que
      // tanto el CLI de Prisma como PrismaService apunten a la base de test.
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.DATABASE_URL = testDatabaseUrl;
      // `db push` no destructivo: asegura el schema sin borrar la base (el aislamiento
      // entre tests lo da el deleteMany del beforeEach). El reset destructivo es explícito
      // y vive en el script `prisma:reset:test`, no en la suite de tests.
      try {
        const prismaCli = require.resolve('prisma/build/index.js');
        execFileSync(
          process.execPath,
          [prismaCli, 'db', 'push'],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              DATABASE_URL: testDatabaseUrl,
            },
            stdio: 'pipe',
          },
        );
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
    });

    beforeEach(async () => {
      await prisma.eventoNormaPublicada.deleteMany();
      await prisma.suscripcionCorreoHabilitado.deleteMany();
      await prisma.suscripcion.deleteMany();
      await prisma.norma.deleteMany();
      await prisma.usuario.deleteMany();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      if (databaseUrlPrevia === undefined) {
        delete process.env.DATABASE_URL;
        return;
      }

      process.env.DATABASE_URL = databaseUrlPrevia;
    });

    it('RepositorioUsuariosPrisma busca usuario existente, reconstruye correo normalizado y retorna null si no existe', async () => {
      await prisma.usuario.create({
        data: {
          id: 'usuario-1',
          nombre: 'Usuario',
          apellido: 'Prueba',
          correoNormalizado: 'USUARIO@TEST.COM',
          rol: 'EDITOR',
        },
      });
      const repositorio = new RepositorioUsuariosPrisma(prisma);

      const usuario = await repositorio.buscarPorId('usuario-1');
      const inexistente = await repositorio.buscarPorId('usuario-inexistente');

      expect(usuario?.obtenerId()).toBe('usuario-1');
      expect(usuario?.obtenerCorreo()).toBe('usuario@test.com');
      expect(usuario?.tieneRol(RolUsuario.EDITOR)).toBe(true);
      expect(inexistente).toBeNull();
    });

    it('RepositorioNormasPrisma guarda BORRADOR con contenido vacío, busca y actualiza a PUBLICADA', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaExpedicion = new Date('2025-01-01T00:00:00.000Z');
      const fechaPublicacionOficial = new Date('2025-01-02T00:00:00.000Z');
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = new Norma({
        id: 'norma-1',
        numero: null,
        titulo: 'Norma de prueba',
        contenido: '',
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        fuente: 'https://www.registroficial.gob.ec/norma-1.pdf',
        estadoJuridico: EstadoNorma.REFORMADA,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion,
        fechaPublicacionOficial,
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(norma);
      const borrador = await repositorio.buscarPorId('norma-1');
      await repositorio.guardar(norma.publicar(fechaPublicacionEnSistema));
      const publicada = await repositorio.buscarPorId('norma-1');

      expect(borrador?.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(borrador?.contenido).toBe('');
      expect(publicada?.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
      expect(publicada?.fechaPublicacionEnSistema).toEqual(
        fechaPublicacionEnSistema,
      );
      expect(publicada?.fuente).toBe(
        'https://www.registroficial.gob.ec/norma-1.pdf',
      );
      expect(publicada?.estadoJuridico).toBe(EstadoNorma.REFORMADA);
    });

    it('RepositorioSuscripcionesPrisma busca por correo normalizado y retorna null si no está habilitado', async () => {
      await crearSuscripcion({
        id: 'suscripcion-1',
        correos: ['suscriptor@test.com'],
      });
      const repositorio = new RepositorioSuscripcionesPrisma(prisma);

      const suscripcion = await repositorio.buscarPorCorreoHabilitado(
        '  SUSCRIPTOR@Test.COM ',
      );
      const inexistente = await repositorio.buscarPorCorreoHabilitado(
        'otro@test.com',
      );

      expect(suscripcion?.id).toBe('suscripcion-1');
      expect(suscripcion?.correosUsuariosHabilitados).toEqual([
        'suscriptor@test.com',
      ]);
      expect(inexistente).toBeNull();
    });

    it('PostgreSQL impide habilitar el mismo correo en dos suscripciones', async () => {
      await crearSuscripcion({
        id: 'suscripcion-1',
        correos: ['suscriptor@test.com'],
      });
      await prisma.suscripcion.create({
        data: {
          id: 'suscripcion-2',
          clienteId: 'cliente-2',
          cantidadMaximaUsuarios: 1,
          estado: 'ACTIVA',
          fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
          fechaFin: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      await expect(
        prisma.suscripcionCorreoHabilitado.create({
          data: {
            id: 'correo-duplicado',
            suscripcionId: 'suscripcion-2',
            correoNormalizado: 'suscriptor@test.com',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('PostgreSQL rechaza cantidadMaximaUsuarios menor o igual a cero', async () => {
      await expect(
        prisma.suscripcion.create({
          data: {
            id: 'suscripcion-invalida-cupo',
            clienteId: 'cliente-invalido',
            cantidadMaximaUsuarios: 0,
            estado: 'ACTIVA',
            fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
            fechaFin: new Date('2026-01-01T00:00:00.000Z'),
          },
        }),
      ).rejects.toThrow();
    });

    it('PostgreSQL rechaza fechaFin igual o anterior a fechaInicio', async () => {
      await expect(
        prisma.suscripcion.create({
          data: {
            id: 'suscripcion-invalida-fechas',
            clienteId: 'cliente-invalido',
            cantidadMaximaUsuarios: 1,
            estado: 'ACTIVA',
            fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
            fechaFin: new Date('2025-01-01T00:00:00.000Z'),
          },
        }),
      ).rejects.toThrow();
    });

    it('PublicadorEventosNormasPrisma persiste evento sin llamar servicios externos', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      await repositorio.guardar(crearNormaBorrador('norma-1'));
      const publicador = new PublicadorEventosNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');

      await publicador.publicarNormaPublicada({
        normaId: 'norma-1',
        fechaPublicacionEnSistema,
        tieneContenidoCompleto: true,
      });

      const eventos = await prisma.eventoNormaPublicada.findMany();
      expect(eventos).toHaveLength(1);
      expect(eventos[0].normaId).toBe('norma-1');
      expect(eventos[0].fechaPublicacionEnSistema).toEqual(
        fechaPublicacionEnSistema,
      );
      expect(eventos[0].tieneContenidoCompleto).toBe(true);
    });

    it('UnidadDeTrabajoPublicacionNormaPrisma guarda norma PUBLICADA y evento en una transacción', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const unidadDeTrabajo = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-publicacion-1',
      );
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = new Norma({
        id: 'norma-transaccional-1',
        numero: null,
        titulo: 'Norma transaccional',
        contenido: 'Texto completo',
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        fuente: 'https://www.registroficial.gob.ec/norma-transaccional.pdf',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(norma);
      await unidadDeTrabajo.guardarNormaPublicadaConEvento(
        norma.publicar(fechaPublicacionEnSistema),
        {
          normaId: norma.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: true,
        },
      );

      const normaPersistida = await repositorio.buscarPorId(norma.id);
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: norma.id },
      });

      expect(normaPersistida?.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      expect(eventos).toHaveLength(1);
      expect(eventos[0].id).toBe('evento-publicacion-1');
    });

    it('UnidadDeTrabajoPublicacionNormaPrisma revierte la norma si falla la persistencia del evento', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const unidadDeTrabajo = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-duplicado',
      );
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = new Norma({
        id: 'norma-rollback-evento',
        numero: null,
        titulo: 'Norma rollback',
        contenido: 'Texto completo',
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        fuente: 'https://www.registroficial.gob.ec/norma-rollback.pdf',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(norma);
      // La FK exige que el evento preexistente apunte a una norma real.
      await repositorio.guardar(crearNormaBorrador('otra-norma'));
      await prisma.eventoNormaPublicada.create({
        data: {
          id: 'evento-duplicado',
          normaId: 'otra-norma',
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      });

      await expect(
        unidadDeTrabajo.guardarNormaPublicadaConEvento(
          norma.publicar(fechaPublicacionEnSistema),
          {
            normaId: norma.id,
            fechaPublicacionEnSistema,
            tieneContenidoCompleto: true,
          },
        ),
      ).rejects.toMatchObject({ code: 'P2002' });

      const normaPersistida = await repositorio.buscarPorId(norma.id);
      const eventosDeNorma = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: norma.id },
      });

      expect(normaPersistida?.estadoEditorial).toBe(
        EstadoEditorialNorma.BORRADOR,
      );
      expect(normaPersistida?.fechaPublicacionEnSistema).toBeNull();
      expect(eventosDeNorma).toHaveLength(0);
    });

    it('UnidadDeTrabajoPublicacionNormaPrisma rechaza un segundo evento para la misma norma (unique norma_id)', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = crearNormaBorrador('norma-doble-publicacion');
      await repositorio.guardar(norma);

      const primeraUnidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-primera-publicacion',
      );
      await primeraUnidad.guardarNormaPublicadaConEvento(
        norma.publicar(fechaPublicacionEnSistema),
        {
          normaId: norma.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      const segundaUnidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-segunda-publicacion',
      );
      await expect(
        segundaUnidad.guardarNormaPublicadaConEvento(
          norma.publicar(fechaPublicacionEnSistema),
          {
            normaId: norma.id,
            fechaPublicacionEnSistema,
            tieneContenidoCompleto: false,
          },
        ),
      ).rejects.toMatchObject({ code: 'P2002' });

      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: norma.id },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].id).toBe('evento-primera-publicacion');
    });

    it('PostgreSQL rechaza eventos de publicación sin norma existente (FK)', async () => {
      await expect(
        prisma.eventoNormaPublicada.create({
          data: {
            id: 'evento-huerfano',
            normaId: 'norma-inexistente',
            fechaPublicacionEnSistema: new Date('2025-06-01T00:00:00.000Z'),
            tieneContenidoCompleto: false,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('UnidadDeTrabajoPublicacionNormaPrisma falla si la norma no existe y no deja evento', async () => {
      const unidadDeTrabajo = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-sin-norma',
      );
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const normaNuncaGuardada = crearNormaBorrador('norma-nunca-guardada');

      await expect(
        unidadDeTrabajo.guardarNormaPublicadaConEvento(
          normaNuncaGuardada.publicar(fechaPublicacionEnSistema),
          {
            normaId: normaNuncaGuardada.id,
            fechaPublicacionEnSistema,
            tieneContenidoCompleto: false,
          },
        ),
      ).rejects.toMatchObject({ code: 'P2025' });

      const eventos = await prisma.eventoNormaPublicada.findMany();
      expect(eventos).toHaveLength(0);
    });

    function crearNormaBorrador(id: string): Norma {
      return new Norma({
        id,
        numero: null,
        titulo: `Norma ${id}`,
        contenido: '',
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        fuente: `https://www.registroficial.gob.ec/${id}.pdf`,
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
        fechaPublicacionEnSistema: null,
      });
    }

    async function crearSuscripcion(opciones: {
      id: string;
      correos: string[];
    }): Promise<void> {
      await prisma.suscripcion.create({
        data: {
          id: opciones.id,
          clienteId: `cliente-${opciones.id}`,
          cantidadMaximaUsuarios: opciones.correos.length,
          estado: EstadoSuscripcion.ACTIVA,
          fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
          fechaFin: new Date('2026-01-01T00:00:00.000Z'),
          correosHabilitados: {
            create: opciones.correos.map((correo, indice) => ({
              id: `${opciones.id}-correo-${indice + 1}`,
              correoNormalizado: correo.trim().toLowerCase(),
            })),
          },
        },
      });
    }
  },
);

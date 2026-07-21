import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  EstadoSuscripcion,
  Norma,
  RolUsuario,
} from '@normativo/dominio';
import {
  CambiarEdicionNorma,
  CrearEdicionRegistroOficial,
  RegistrarNorma,
  ResolverFuenteRegistroOficial,
} from '@normativo/aplicacion';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositorioUsuariosPrisma } from '../RepositorioUsuariosPrisma';
import { RepositorioCredencialesUsuariosPrisma } from '../RepositorioCredencialesUsuariosPrisma';
import { RepositorioUsuariosSistemaPrisma } from '../RepositorioUsuariosSistemaPrisma';
import { RepositorioNormasPrisma } from '../RepositorioNormasPrisma';
import { RepositorioEdicionesRegistroOficialPrisma } from '../RepositorioEdicionesRegistroOficialPrisma';
import { RepositorioIngestaRegistroOficialPrisma } from '../RepositorioIngestaRegistroOficialPrisma';
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
      // PrismaService apunte exclusivamente a la base de test. El script
      // test:prisma aplica primero la cadena real con `prisma migrate deploy`.
      databaseUrlPrevia = process.env.DATABASE_URL;
      process.env.DATABASE_URL = testDatabaseUrl;
      prisma = new PrismaService();
      await prisma.$connect();
      await aplicarChecksPrisma(prisma);
    });

    beforeEach(async () => {
      await prisma.eventoNormaPublicada.deleteMany();
      await prisma.suscripcionCorreoHabilitado.deleteMany();
      await prisma.suscripcion.deleteMany();
      // Las entradas de ingesta referencian normas con FK RESTRICT: se
      // limpian primero para poder borrar las normas. Las normas referencian
      // ediciones con FK RESTRICT: las ediciones se limpian al final.
      await prisma.entradaDetectadaRegistroOficial.deleteMany();
      await prisma.loteIngestaRegistroOficial.deleteMany();
      await prisma.norma.deleteMany();
      await prisma.edicionRegistroOficial.deleteMany();
      await prisma.usuario.deleteMany();

      // Edición publicable compartida por las normas de prueba.
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-prueba',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
          estadoResolucionFuente: 'RESUELTA',
        },
      });
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

    it('RepositorioCredencialesUsuariosPrisma busca por correo normalizado y preserva passwordHash', async () => {
      await prisma.usuario.create({
        data: {
          id: 'usuario-con-password',
          nombre: 'Usuario',
          apellido: 'ConPassword',
          correoNormalizado: 'con-password@test.com',
          rol: 'EDITOR',
          passwordHash: 'scrypt:v1:c2FsdA==:aGFzaA==',
        },
      });
      await prisma.usuario.create({
        data: {
          id: 'usuario-sin-password',
          nombre: 'Usuario',
          apellido: 'SinPassword',
          correoNormalizado: 'sin-password@test.com',
          rol: 'SUSCRIPTOR',
        },
      });
      const repositorio = new RepositorioCredencialesUsuariosPrisma(prisma);

      const conPassword = await repositorio.buscarPorCorreo('con-password@test.com');
      const sinPassword = await repositorio.buscarPorCorreo('sin-password@test.com');
      const inexistente = await repositorio.buscarPorCorreo('nadie@test.com');

      expect(conPassword).toEqual({
        usuarioId: 'usuario-con-password',
        rol: RolUsuario.EDITOR,
        hashContrasena: 'scrypt:v1:c2FsdA==:aGFzaA==',
      });
      expect(sinPassword).toEqual({
        usuarioId: 'usuario-sin-password',
        rol: RolUsuario.SUSCRIPTOR,
        hashContrasena: null,
      });
      expect(inexistente).toBeNull();
    });

    it('RepositorioUsuariosSistemaPrisma traduce el P2002 de correo a duplicado y propaga otros errores', async () => {
      const repositorio = new RepositorioUsuariosSistemaPrisma(prisma);
      const base = {
        nombre: 'Editor',
        apellido: 'Sistema',
        rol: RolUsuario.EDITOR,
        passwordHash: 'scrypt:v1:c2FsdA==:aGFzaA==',
      };

      // Creación normal.
      const creado = await repositorio.crear({
        ...base,
        id: 'usuario-sistema-1',
        correoNormalizado: 'sistema-1@test.com',
      });
      expect(creado).toEqual({ exitoso: true });

      // Duplicado de correo SIN pre-verificación: el UNIQUE dispara P2002 y el
      // adaptador lo traduce al resultado del puerto (no error crudo).
      const duplicado = await repositorio.crear({
        ...base,
        id: 'usuario-sistema-2',
        correoNormalizado: 'sistema-1@test.com',
      });
      expect(duplicado).toEqual({
        exitoso: false,
        razon: 'CORREO_YA_REGISTRADO',
      });
      const segundos = await prisma.usuario.findUnique({
        where: { id: 'usuario-sistema-2' },
      });
      expect(segundos).toBeNull();

      // Otro error (P2002 sobre la clave primaria, no sobre el correo) NO se
      // oculta como duplicado: se propaga.
      await expect(
        repositorio.crear({
          ...base,
          id: 'usuario-sistema-1',
          correoNormalizado: 'sistema-otro@test.com',
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
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
        contenido: [],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: EstadoNorma.REFORMADA,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion,
        edicionRegistroOficialId: 'edicion-prueba',
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(norma);
      const borrador = await repositorio.buscarPorId('norma-1');
      await repositorio.guardar(norma.publicar(fechaPublicacionEnSistema));
      const publicada = await repositorio.buscarPorId('norma-1');

      expect(borrador?.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(borrador?.contenido).toEqual([]);
      expect(publicada?.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
      expect(publicada?.fechaPublicacionEnSistema).toEqual(
        fechaPublicacionEnSistema,
      );
      expect(publicada?.edicionRegistroOficialId).toBe('edicion-prueba');
      expect(publicada?.estadoJuridico).toBe(EstadoNorma.REFORMADA);
    });

    it('RepositorioNormasPrisma persiste un BORRADOR incompleto (campos nulos/vacíos) y lo lista por estado editorial', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const borradorIncompleto = new Norma({
        id: 'norma-incompleta',
        numero: null,
        titulo: '',
        contenido: [],
        tipoNorma: '',
        institucionExpide: '',
        estadoJuridico: null,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: null,
        edicionRegistroOficialId: null,
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(borradorIncompleto);
      const recuperada = await repositorio.buscarPorId('norma-incompleta');

      expect(recuperada?.titulo).toBe('');
      expect(recuperada?.estadoJuridico).toBeNull();
      expect(recuperada?.fechaExpedicion).toBeNull();
      expect(recuperada?.edicionRegistroOficialId).toBeNull();

      const borradores = await repositorio.listar({
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
      });
      expect(borradores.map((norma) => norma.id)).toContain('norma-incompleta');
      const publicadas = await repositorio.listar({
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      });
      expect(publicadas.map((norma) => norma.id)).not.toContain(
        'norma-incompleta',
      );
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
        contenido: ['Texto completo'],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        edicionRegistroOficialId: 'edicion-prueba',
        fechaPublicacionEnSistema: null,
      });

      await repositorio.guardar(norma);
      const resultado = await unidadDeTrabajo.guardarNormaPublicadaConEvento(
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

      expect(resultado).toEqual({
        publicada: true,
        tieneContenidoCompleto: true,
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
        contenido: ['Texto completo'],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        edicionRegistroOficialId: 'edicion-prueba',
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

    it('UnidadDeTrabajoPublicacionNormaPrisma pierde la carrera de una segunda publicación sin P2002 y con un solo evento', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = crearNormaBorrador('norma-doble-publicacion');
      await repositorio.guardar(norma);

      const primeraUnidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-primera-publicacion',
      );
      const primerResultado = await primeraUnidad.guardarNormaPublicadaConEvento(
        norma.publicar(fechaPublicacionEnSistema),
        {
          normaId: norma.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      // La segunda publicación pierde en la actualización condicionada: no
      // llega a insertar evento ni filtra el P2002 del unique norma_id.
      const segundaUnidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-segunda-publicacion',
      );
      const segundoResultado =
        await segundaUnidad.guardarNormaPublicadaConEvento(
          norma.publicar(fechaPublicacionEnSistema),
          {
            normaId: norma.id,
            fechaPublicacionEnSistema,
            tieneContenidoCompleto: false,
          },
        );

      expect(primerResultado).toEqual({
        publicada: true,
        tieneContenidoCompleto: false,
      });
      expect(segundoResultado).toEqual({
        publicada: false,
        razon: 'NORMA_YA_PUBLICADA',
      });
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: norma.id },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].id).toBe('evento-primera-publicacion');
    });

    it('dos publicaciones concurrentes: exactamente una gana, una pierde tipada, un solo evento', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = crearNormaBorrador('norma-carrera-publicacion');
      await repositorio.guardar(norma);
      const normaPublicada = norma.publicar(fechaPublicacionEnSistema);
      const evento = {
        normaId: norma.id,
        fechaPublicacionEnSistema,
        tieneContenidoCompleto: false,
      };

      const [resultadoA, resultadoB] = await Promise.all([
        new UnidadDeTrabajoPublicacionNormaPrisma(
          prisma,
          () => 'evento-carrera-a',
        ).guardarNormaPublicadaConEvento(normaPublicada, evento),
        new UnidadDeTrabajoPublicacionNormaPrisma(
          prisma,
          () => 'evento-carrera-b',
        ).guardarNormaPublicadaConEvento(normaPublicada, evento),
      ]);

      const resultados = [resultadoA, resultadoB];
      expect(
        resultados.filter((resultado) => resultado.publicada),
      ).toHaveLength(1);
      expect(resultados).toContainEqual({
        publicada: false,
        razon: 'NORMA_YA_PUBLICADA',
      });
      const persistida = await repositorio.buscarPorId(norma.id);
      expect(persistida?.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: norma.id },
      });
      expect(eventos).toHaveLength(1);
    });

    it('una corrección obsoleta no revierte una norma publicada (actualizarBorrador condicionado)', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const copiaLeida = crearNormaBorrador('norma-correccion-obsoleta');
      await repositorio.guardar(copiaLeida);
      // Otra transacción publica después de que la corrección leyó su copia.
      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-correccion-obsoleta',
      );
      await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      const resultado = await repositorio.actualizarBorrador(
        copiaLeida.actualizarDatosEditoriales({
          titulo: 'Corrección obsoleta',
        }),
      );

      expect(resultado).toEqual({
        actualizada: false,
        razon: 'NORMA_NO_EDITABLE',
      });
      const persistida = await repositorio.buscarPorId(copiaLeida.id);
      expect(persistida?.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      expect(persistida?.titulo).toBe(copiaLeida.titulo);
      expect(persistida?.fechaPublicacionEnSistema).toEqual(
        fechaPublicacionEnSistema,
      );
    });

    it('actualizarBorrador devuelve NORMA_NO_ENCONTRADA para una norma inexistente', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);

      const resultado = await repositorio.actualizarBorrador(
        crearNormaBorrador('norma-inexistente'),
      );

      expect(resultado).toEqual({
        actualizada: false,
        razon: 'NORMA_NO_ENCONTRADA',
      });
    });

    it('publicar con una copia leída antes de una corrección conserva la corrección persistida', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const copiaLeida = crearNormaBorrador('norma-correccion-previa');
      await repositorio.guardar(copiaLeida);
      // Corrección editorial persistida después de la lectura de la copia.
      const correccion = await repositorio.actualizarBorrador(
        copiaLeida.actualizarDatosEditoriales({
          titulo: 'Título corregido',
          numero: '456',
        }),
      );
      expect(correccion.actualizada).toBe(true);

      // La publicación usa la copia previa (obsoleta): solo debe escribir
      // estado editorial y fecha, nunca los datos editoriales de la copia.
      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-correccion-previa',
      );
      const resultado = await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: true,
        tieneContenidoCompleto: false,
      });
      const persistida = await repositorio.buscarPorId(copiaLeida.id);
      expect(persistida?.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      expect(persistida?.fechaPublicacionEnSistema).toEqual(
        fechaPublicacionEnSistema,
      );
      expect(persistida?.titulo).toBe('Título corregido');
      expect(persistida?.numero).toBe('456');
    });

    it('una corrección concurrente que limpia el título bloquea la publicación con NORMA_MODIFICADA_CONCURRENTEMENTE', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const copiaLeida = crearNormaBorrador('norma-titulo-vaciado');
      await repositorio.guardar(copiaLeida);
      // Después de la lectura, la corrección deja la norma sin título
      // (válido en BORRADOR, no publicable).
      const correccion = await repositorio.actualizarBorrador(
        copiaLeida.actualizarDatosEditoriales({ titulo: '' }),
      );
      expect(correccion.actualizada).toBe(true);

      // La UoW recibe la copia inicialmente válida: la barrera atómica debe
      // impedir publicar el estado persistido inválido.
      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-titulo-vaciado',
      );
      const resultado = await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: false,
        razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
      });
      const fila = await prisma.norma.findUnique({
        where: { id: copiaLeida.id },
      });
      expect(fila?.estadoEditorial).toBe('BORRADOR');
      expect(fila?.titulo).toBe('');
      expect(fila?.fechaPublicacionEnSistema).toBeNull();
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: copiaLeida.id },
      });
      expect(eventos).toHaveLength(0);
    });

    it('un cambio concurrente a una edición PENDIENTE bloquea la publicación con NORMA_MODIFICADA_CONCURRENTEMENTE', async () => {
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-pendiente',
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 601,
          fechaPublicacionOficial: new Date('2025-02-03T00:00:00.000Z'),
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        },
      });
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      // Copia leída con edición MANUAL publicable.
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-manual',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 602,
          fechaPublicacionOficial: new Date('2025-02-04T00:00:00.000Z'),
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-602.pdf',
          estadoResolucionFuente: 'MANUAL',
        },
      });
      const copiaLeida = crearNormaBorrador('norma-edicion-pendiente')
        .asociarEdicionRegistroOficial('edicion-manual');
      await repositorio.guardar(copiaLeida);
      // Reasignación concurrente hacia la edición sin fuente publicable.
      const cambio = await repositorio.reemplazarEdicionPrincipalSiEstado(
        copiaLeida.id,
        'edicion-pendiente',
        EstadoEditorialNorma.BORRADOR,
      );
      expect(cambio.actualizada).toBe(true);

      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-edicion-pendiente',
      );
      const resultado = await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: false,
        razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
      });
      const fila = await prisma.norma.findUnique({
        where: { id: copiaLeida.id },
      });
      expect(fila?.estadoEditorial).toBe('BORRADOR');
      // La FK hacia la edición PENDIENTE se conserva.
      expect(fila?.edicionRegistroOficialId).toBe('edicion-pendiente');
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: copiaLeida.id },
      });
      expect(eventos).toHaveLength(0);
    });

    it('un cambio concurrente a otra edición publicable permite publicar conservando la edición nueva', async () => {
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-manual-b',
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 603,
          fechaPublicacionOficial: new Date('2025-02-05T00:00:00.000Z'),
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-603.pdf',
          estadoResolucionFuente: 'MANUAL',
        },
      });
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const copiaLeida = crearNormaBorrador('norma-edicion-publicable-b');
      await repositorio.guardar(copiaLeida);
      const cambio = await repositorio.reemplazarEdicionPrincipalSiEstado(
        copiaLeida.id,
        'edicion-manual-b',
        EstadoEditorialNorma.BORRADOR,
      );
      expect(cambio.actualizada).toBe(true);

      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-edicion-publicable-b',
      );
      const resultado = await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: true,
        tieneContenidoCompleto: false,
      });
      const fila = await prisma.norma.findUnique({
        where: { id: copiaLeida.id },
      });
      expect(fila?.estadoEditorial).toBe('PUBLICADA');
      expect(fila?.edicionRegistroOficialId).toBe('edicion-manual-b');
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: copiaLeida.id },
      });
      expect(eventos).toHaveLength(1);
    });

    it('el evento refleja el contenido persistido vigente cuando cambió concurrentemente de vacío a completo', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const copiaLeida = crearNormaBorrador('norma-contenido-vigente');
      await repositorio.guardar(copiaLeida);
      // El contenido pasa de [] a completo después de la lectura.
      const correccion = await repositorio.actualizarBorrador(
        copiaLeida.actualizarDatosEditoriales({
          contenido: ['Texto completo'],
        }),
      );
      expect(correccion.actualizada).toBe(true);

      const unidad = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-contenido-vigente',
      );
      const resultado = await unidad.guardarNormaPublicadaConEvento(
        copiaLeida.publicar(fechaPublicacionEnSistema),
        {
          normaId: copiaLeida.id,
          fechaPublicacionEnSistema,
          // Calculado sobre la copia obsoleta: la unidad debe recalcularlo.
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: true,
        tieneContenidoCompleto: true,
      });
      const eventos = await prisma.eventoNormaPublicada.findMany({
        where: { normaId: copiaLeida.id },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].tieneContenidoCompleto).toBe(true);
    });

    it('reemplazarEdicionPrincipalSiEstado conserva la anterior y detecta el cambio de estado concurrente', async () => {
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-destino',
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 600,
          fechaPublicacionOficial: new Date('2025-02-02T00:00:00.000Z'),
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-600.pdf',
          estadoResolucionFuente: 'MANUAL',
        },
      });
      const repositorio = new RepositorioNormasPrisma(prisma);
      const norma = crearNormaBorrador('norma-cambio-edicion');
      await repositorio.guardar(norma);

      const resultado = await repositorio.reemplazarEdicionPrincipalSiEstado(
        norma.id,
        'edicion-destino',
        EstadoEditorialNorma.BORRADOR,
      );

      expect(resultado.actualizada).toBe(true);
      if (!resultado.actualizada) {
        return;
      }
      const persistida = resultado.norma;
      expect(persistida.edicionRegistroOficialId).toBe('edicion-destino');
      // Solo cambió la FK: el resto de la norma queda intacto.
      expect(persistida.titulo).toBe(norma.titulo);
      expect(persistida.contenido).toEqual(norma.contenido);
      expect(persistida.estadoJuridico).toBe(norma.estadoJuridico);
      expect(persistida.estadoEditorial).toBe(norma.estadoEditorial);
      expect(resultado.edicionesCambioIds).toEqual(['edicion-prueba']);

      // Publicación concurrente: el cambio condicionado a BORRADOR ya no aplica.
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      await new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-cambio-edicion',
      ).guardarNormaPublicadaConEvento(
        persistida.publicar(fechaPublicacionEnSistema),
        {
          normaId: norma.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );
      const conflicto = await repositorio.reemplazarEdicionPrincipalSiEstado(
        norma.id,
        'edicion-prueba',
        EstadoEditorialNorma.BORRADOR,
      );

      expect(conflicto).toEqual({
        actualizada: false,
        razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
      });
      expect(
        (await repositorio.buscarPorId(norma.id))?.edicionRegistroOficialId,
      ).toBe('edicion-destino');
    });

    it('persiste varias ediciones de cambio, comparte una edición entre normas y consulta en bloque', async () => {
      await prisma.edicionRegistroOficial.createMany({
        data: [
          {
            id: 'edicion-segunda',
            tipoPublicacionRegistroOficial: 'SRO',
            numeroPublicacionRegistroOficial: 610,
            fechaPublicacionOficial: new Date('2025-02-10T00:00:00.000Z'),
            urlPdf: 'https://registroficial.gob.ec/sro-610.pdf',
            estadoResolucionFuente: 'MANUAL',
          },
          {
            id: 'edicion-tercera',
            tipoPublicacionRegistroOficial: '2SRO',
            numeroPublicacionRegistroOficial: 611,
            fechaPublicacionOficial: new Date('2025-03-10T00:00:00.000Z'),
            urlPdf: null,
            estadoResolucionFuente: 'PENDIENTE',
          },
        ],
      });
      const repositorio = new RepositorioNormasPrisma(prisma);
      await repositorio.guardar(crearNormaBorrador('norma-cambios-1'));
      await repositorio.guardar(crearNormaBorrador('norma-cambios-2'));

      await repositorio.reemplazarEdicionPrincipalSiEstado(
        'norma-cambios-1',
        'edicion-segunda',
        EstadoEditorialNorma.BORRADOR,
      );
      await repositorio.reemplazarEdicionPrincipalSiEstado(
        'norma-cambios-1',
        'edicion-tercera',
        EstadoEditorialNorma.BORRADOR,
      );
      await repositorio.reemplazarEdicionPrincipalSiEstado(
        'norma-cambios-2',
        'edicion-segunda',
        EstadoEditorialNorma.BORRADOR,
      );

      const cambios = await repositorio.buscarCambiosPorNormaIds([
        'norma-cambios-1',
        'norma-cambios-2',
        'norma-sin-cambios',
      ]);
      expect(new Set(cambios.get('norma-cambios-1'))).toEqual(
        new Set(['edicion-prueba', 'edicion-segunda']),
      );
      expect(cambios.get('norma-cambios-2')).toEqual(['edicion-prueba']);
      expect(cambios.get('norma-sin-cambios')).toEqual([]);
      await expect(
        prisma.normaEdicionRegistroOficialCambio.count({
          where: { edicionRegistroOficialId: 'edicion-prueba' },
        }),
      ).resolves.toBe(2);

      // Promover una edición que ya era cambio la retira de cambios y conserva
      // como cambio la principal reemplazada.
      await repositorio.reemplazarEdicionPrincipalSiEstado(
        'norma-cambios-1',
        'edicion-prueba',
        EstadoEditorialNorma.BORRADOR,
      );
      expect(
        new Set(await repositorio.buscarCambiosPorNormaId('norma-cambios-1')),
      ).toEqual(new Set(['edicion-segunda', 'edicion-tercera']));
    });

    it('la clave compuesta y las FKs rechazan asociaciones duplicadas o huérfanas', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      await repositorio.guardar(crearNormaBorrador('norma-integridad-cambios'));
      await prisma.normaEdicionRegistroOficialCambio.create({
        data: {
          normaId: 'norma-integridad-cambios',
          edicionRegistroOficialId: 'edicion-prueba',
        },
      });

      await expect(
        prisma.normaEdicionRegistroOficialCambio.create({
          data: {
            normaId: 'norma-integridad-cambios',
            edicionRegistroOficialId: 'edicion-prueba',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.normaEdicionRegistroOficialCambio.create({
          data: {
            normaId: 'norma-inexistente',
            edicionRegistroOficialId: 'edicion-prueba',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await expect(
        prisma.normaEdicionRegistroOficialCambio.create({
          data: {
            normaId: 'norma-integridad-cambios',
            edicionRegistroOficialId: 'edicion-inexistente',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('revierte el reemplazo completo si la nueva principal viola su FK', async () => {
      const repositorio = new RepositorioNormasPrisma(prisma);
      await repositorio.guardar(crearNormaBorrador('norma-rollback-cambios'));

      await expect(
        repositorio.reemplazarEdicionPrincipalSiEstado(
          'norma-rollback-cambios',
          'edicion-inexistente',
          EstadoEditorialNorma.BORRADOR,
        ),
      ).rejects.toMatchObject({ code: 'P2003' });
      await expect(
        repositorio.buscarPorId('norma-rollback-cambios'),
      ).resolves.toMatchObject({ edicionRegistroOficialId: 'edicion-prueba' });
      await expect(
        repositorio.buscarCambiosPorNormaId('norma-rollback-cambios'),
      ).resolves.toEqual([]);
    });

    it('CambiarEdicionNorma sobre PostgreSQL: una norma PUBLICADA no queda vinculada a una edición no publicable', async () => {
      await prisma.usuario.create({
        data: {
          id: 'editor-cambio-edicion',
          nombre: 'Editor',
          apellido: 'Cambio edición',
          correoNormalizado: 'editor-cambio-edicion@test.com',
          rol: 'EDITOR',
        },
      });
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-pendiente',
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 700,
          fechaPublicacionOficial: new Date('2025-03-03T00:00:00.000Z'),
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        },
      });
      const repositorio = new RepositorioNormasPrisma(prisma);
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const norma = crearNormaBorrador('norma-publicada-edicion');
      await repositorio.guardar(norma.publicar(fechaPublicacionEnSistema));
      const casoUso = new CambiarEdicionNorma({
        repositorioUsuarios: new RepositorioUsuariosPrisma(prisma),
        repositorioNormas: repositorio,
        repositorioEdiciones: new RepositorioEdicionesRegistroOficialPrisma(
          prisma,
        ),
        consultorOrigenRegistroOficial:
          new RepositorioIngestaRegistroOficialPrisma(prisma),
      });

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'editor-cambio-edicion',
        normaId: norma.id,
        edicionRegistroOficialId: 'edicion-pendiente',
      });

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'FUENTE_REQUERIDA',
      });
      expect(
        (await repositorio.buscarPorId(norma.id))?.edicionRegistroOficialId,
      ).toBe('edicion-prueba');
    });

    it('RepositorioEdicionesRegistroOficialPrisma guarda, busca por id/clave/estado y actualiza la fuente', async () => {
      const repositorio = new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const pendiente = new EdicionRegistroOficial({
        id: 'edicion-1',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2026-05-04T00:00:00.000Z'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      });

      await repositorio.guardar(pendiente);

      const porId = await repositorio.buscarPorId('edicion-1');
      expect(porId?.urlPdf).toBeNull();
      expect(porId?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.PENDIENTE,
      );

      const porClave = await repositorio.buscarPorClave({
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2026-05-04T00:00:00.000Z'),
      });
      expect(porClave?.id).toBe('edicion-1');

      const pendientes = await repositorio.listarPorEstadoResolucionFuente([
        EstadoResolucionFuente.PENDIENTE,
      ]);
      expect(pendientes.map((edicion) => edicion.id)).toEqual(['edicion-1']);

      const corregida = pendiente.corregirFuenteManualmente(
        'https://www.registroficial.gob.ec/ediciones/sro-700.pdf',
      );
      await repositorio.guardar(corregida);
      const actualizada = await repositorio.buscarPorId('edicion-1');
      expect(actualizada?.urlPdf).toBe(
        'https://www.registroficial.gob.ec/ediciones/sro-700.pdf',
      );
      expect(actualizada?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
      expect(await repositorio.buscarPorIds(['edicion-1', 'no-existe'])).toHaveLength(1);
    });

    it('dos creaciones Prisma simultáneas de la misma triple terminan y reutilizan un único id', async () => {
      const repositorio = new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const propsCompartidas = {
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 901,
        fechaPublicacionOficial: new Date('2026-07-01T00:00:00.000Z'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      };

      const resultados = await Promise.all([
        repositorio.crearORecuperar(
          new EdicionRegistroOficial({ id: 'edicion-concurrente-a', ...propsCompartidas }),
        ),
        repositorio.crearORecuperar(
          new EdicionRegistroOficial({ id: 'edicion-concurrente-b', ...propsCompartidas }),
        ),
      ]);

      expect(resultados.map((resultado) => resultado.esNueva).sort()).toEqual([
        false,
        true,
      ]);
      expect(new Set(resultados.map((resultado) => resultado.edicion.id)).size).toBe(1);
      expect(
        await prisma.edicionRegistroOficial.count({
          where: {
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: 901,
            fechaPublicacionOficial: new Date('2026-07-01T00:00:00.000Z'),
          },
        }),
      ).toBe(1);
    });

    it('la creación manual concurrente devuelve un conflicto sin duplicar ni sobrescribir la URL ganadora', async () => {
      await prisma.usuario.create({
        data: {
          id: 'editor-creacion-concurrente',
          nombre: 'Editor',
          apellido: 'Concurrente',
          correoNormalizado: 'editor-creacion-concurrente@test.com',
          rol: 'EDITOR',
        },
      });
      const repositorio = new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const dependencias = {
        repositorioUsuarios: new RepositorioUsuariosPrisma(prisma),
        repositorioEdiciones: repositorio,
      };
      const crearA = new CrearEdicionRegistroOficial({
        ...dependencias,
        generadorIds: { generar: () => 'edicion-manual-concurrente-a' },
      });
      const crearB = new CrearEdicionRegistroOficial({
        ...dependencias,
        generadorIds: { generar: () => 'edicion-manual-concurrente-b' },
      });
      const solicitudBase = {
        usuarioAutenticadoId: 'editor-creacion-concurrente',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 902,
        fechaPublicacionOficial: new Date('2026-07-02T00:00:00.000Z'),
      };

      const resultados = await Promise.all([
        crearA.ejecutar({
          ...solicitudBase,
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-902-a.pdf',
        }),
        crearB.ejecutar({
          ...solicitudBase,
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-902-b.pdf',
        }),
      ]);

      const exitosos = resultados.filter(
        (resultado): resultado is Extract<typeof resultado, { exitoso: true }> =>
          resultado.exitoso,
      );
      const fallidos = resultados.filter(
        (resultado): resultado is Extract<typeof resultado, { exitoso: false }> =>
          !resultado.exitoso,
      );
      expect(exitosos).toHaveLength(1);
      expect(fallidos).toEqual([
        { exitoso: false, razon: 'EDICION_YA_EXISTE' },
      ]);
      const ganadora = exitosos[0];
      const persistida = await repositorio.buscarPorId(ganadora.edicion.id);
      expect(persistida?.urlPdf).toBe(ganadora.edicion.urlPdf);
      expect(persistida?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
      expect(
        await prisma.edicionRegistroOficial.count({
          where: {
            tipoPublicacionRegistroOficial: 'SRO',
            numeroPublicacionRegistroOficial: 902,
            fechaPublicacionOficial: new Date('2026-07-02T00:00:00.000Z'),
          },
        }),
      ).toBe(1);
    });

    it('la resolución automática Prisma omite una corrección MANUAL concurrente', async () => {
      await prisma.usuario.create({
        data: {
          id: 'superadmin-resolucion-manual',
          nombre: 'Superadmin',
          apellido: 'Concurrente',
          correoNormalizado: 'superadmin-resolucion-manual@test.com',
          rol: 'SUPERADMINISTRADOR',
        },
      });
      const repositorio = new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const pendiente = new EdicionRegistroOficial({
        id: 'edicion-resolucion-manual',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 903,
        fechaPublicacionOficial: new Date('2026-07-03T00:00:00.000Z'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      });
      await repositorio.guardar(pendiente);
      let avisarConsulta!: () => void;
      let liberarConsulta!: () => void;
      const consultaIniciada = new Promise<void>((resolve) => {
        avisarConsulta = resolve;
      });
      const continuarConsulta = new Promise<void>((resolve) => {
        liberarConsulta = resolve;
      });
      const casoUso = new ResolverFuenteRegistroOficial({
        repositorioUsuarios: new RepositorioUsuariosPrisma(prisma),
        repositorioEdiciones: repositorio,
        catalogoRegistroOficial: {
          buscarEdiciones: async () => {
            avisarConsulta();
            await continuarConsulta;
            return [
              {
                urlPdf: 'https://www.registroficial.gob.ec/auto-903.pdf',
                fechaPublicacionOficial: null,
              },
            ];
          },
        },
      });

      const resolucion = casoUso.ejecutar({
        usuarioAutenticadoId: 'superadmin-resolucion-manual',
        edicionIds: [pendiente.id],
      });
      await consultaIniciada;
      const urlManual = 'https://www.registroficial.gob.ec/manual-903.pdf';
      await repositorio.guardar(pendiente.corregirFuenteManualmente(urlManual));
      liberarConsulta();

      await expect(resolucion).resolves.toEqual({
        exitoso: true,
        resultados: [
          {
            edicionId: pendiente.id,
            procesada: false,
            razon: 'FUENTE_YA_ESTABLECIDA',
          },
        ],
      });
      const persistida = await repositorio.buscarPorId(pendiente.id);
      expect(persistida?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
      expect(persistida?.urlPdf).toBe(urlManual);
    });

    it('la resolución automática Prisma no sobrescribe una RESUELTA concurrente', async () => {
      const repositorio = new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const pendiente = new EdicionRegistroOficial({
        id: 'edicion-resolucion-resuelta',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 904,
        fechaPublicacionOficial: new Date('2026-07-04T00:00:00.000Z'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      });
      await repositorio.guardar(pendiente);
      const urlGanadora = 'https://www.registroficial.gob.ec/ganadora-904.pdf';
      const ganadora = pendiente.resolverFuente(urlGanadora);
      expect(
        await repositorio.guardarResolucionSiPendiente(ganadora),
      ).toEqual({ actualizada: true, edicionActual: ganadora });

      const obsoleta = pendiente.resolverFuente(
        'https://www.registroficial.gob.ec/obsoleta-904.pdf',
      );
      const resultado = await repositorio.guardarResolucionSiPendiente(obsoleta);

      expect(resultado.actualizada).toBe(false);
      expect(resultado.edicionActual?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.RESUELTA,
      );
      expect(resultado.edicionActual?.urlPdf).toBe(urlGanadora);
      expect((await repositorio.buscarPorId(pendiente.id))?.urlPdf).toBe(
        urlGanadora,
      );
    });

    it('varios registros de norma concurrentes comparten una sola edición Prisma', async () => {
      await prisma.usuario.create({
        data: {
          id: 'editor-normas-concurrentes',
          nombre: 'Editor',
          apellido: 'Normas concurrentes',
          correoNormalizado: 'editor-normas-concurrentes@test.com',
          rol: 'EDITOR',
        },
      });
      const dependencias = {
        repositorioUsuarios: new RepositorioUsuariosPrisma(prisma),
        repositorioNormas: new RepositorioNormasPrisma(prisma),
        repositorioEdiciones: new RepositorioEdicionesRegistroOficialPrisma(
          prisma,
        ),
        generadorIds: new GeneradorIdsUuid(),
      };
      const registrarA = new RegistrarNorma(dependencias);
      const registrarB = new RegistrarNorma(dependencias);
      const solicitudBase = {
        usuarioAutenticadoId: 'editor-normas-concurrentes',
        titulo: 'Norma concurrente',
        tipoNorma: 'Resolución',
        institucionExpide: 'Institución de prueba',
        fechaPublicacionOficial: new Date('2026-07-05T00:00:00.000Z'),
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 905,
      };

      const resultados = await Promise.all([
        registrarA.ejecutar({ ...solicitudBase, numero: 'A' }),
        registrarB.ejecutar({ ...solicitudBase, numero: 'B' }),
      ]);

      expect(resultados.every((resultado) => resultado.exitoso)).toBe(true);
      const normas = await prisma.norma.findMany({
        where: { numero: { in: ['A', 'B'] } },
      });
      expect(normas).toHaveLength(2);
      expect(
        new Set(normas.map((norma) => norma.edicionRegistroOficialId)).size,
      ).toBe(1);
      expect(
        await prisma.edicionRegistroOficial.count({
          where: {
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: 905,
            fechaPublicacionOficial: new Date('2026-07-05T00:00:00.000Z'),
          },
        }),
      ).toBe(1);
    });

    it('dos lotes mensuales concurrentes reutilizan una edición sin sobrescribir fuente ni estado', async () => {
      const repositorioEdiciones =
        new RepositorioEdicionesRegistroOficialPrisma(prisma);
      const edicionManual = new EdicionRegistroOficial({
        id: 'edicion-ingesta-concurrente-manual',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 906,
        fechaPublicacionOficial: new Date('2026-07-06T00:00:00.000Z'),
        urlPdf:
          'https://www.registroficial.gob.ec/ediciones/sro-906-manual.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
      });
      await repositorioEdiciones.guardar(edicionManual);
      const repositorioIngesta = new RepositorioIngestaRegistroOficialPrisma(
        prisma,
      );

      const crearIngesta = (sufijo: 'a' | 'b') => {
        const edicionPropuesta = new EdicionRegistroOficial({
          id: `edicion-ingesta-concurrente-${sufijo}`,
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 906,
          fechaPublicacionOficial: new Date('2026-07-06T00:00:00.000Z'),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        });
        const norma = new Norma({
          id: `norma-ingesta-concurrente-${sufijo}`,
          numero: sufijo.toUpperCase(),
          titulo: `Norma de ingesta concurrente ${sufijo}`,
          contenido: [],
          tipoNorma: 'Resolución',
          institucionExpide: 'Institución de prueba',
          estadoJuridico: EstadoNorma.VIGENTE,
          estadoEditorial: EstadoEditorialNorma.BORRADOR,
          fechaExpedicion: null,
          edicionRegistroOficialId: edicionPropuesta.id,
          fechaPublicacionEnSistema: null,
        });
        return {
          lote: {
            id: `lote-ingesta-concurrente-${sufijo}`,
            huellaLote: `huella-lote-${sufijo}`,
            periodoAnio: 2026,
            periodoMes: sufijo === 'a' ? 7 : 8,
            fechaEjecucion: new Date(`2026-07-0${sufijo === 'a' ? '7' : '8'}T00:00:00.000Z`),
            urlResumenMensualRegistroOficial:
              `https://www.registroficial.gob.ec/resumen-${sufijo}.pdf`,
            versionExtractor: 'fase-5a-test',
          },
          ediciones: [edicionPropuesta],
          normas: [norma],
          entradas: [
            {
              id: `entrada-ingesta-concurrente-${sufijo}`,
              loteId: `lote-ingesta-concurrente-${sufijo}`,
              posicion: 0,
              normaId: norma.id,
              segmentoCrudo: `Resolución concurrente ${sufijo}`,
              metadataExtraccion: {},
              advertencias: [],
              confianza: 1,
              fechaCreacion: new Date('2026-07-09T00:00:00.000Z'),
              tipoDetectado: 'Resolución',
              numeroDetectado: sufijo.toUpperCase(),
              tituloDetectado: `Norma de ingesta concurrente ${sufijo}`,
              institucionDetectada: 'Institución de prueba',
              seccion: 'Función Ejecutiva',
              publicacionTipo: 'SRO',
              publicacionNumero: 906,
              publicacionFecha: new Date('2026-07-06T00:00:00.000Z'),
            },
          ],
        };
      };

      const resultados = await Promise.all([
        repositorioIngesta.guardarIngesta(crearIngesta('a')),
        repositorioIngesta.guardarIngesta(crearIngesta('b')),
      ]);

      expect(resultados).toEqual([{ exitoso: true }, { exitoso: true }]);
      expect(
        await prisma.loteIngestaRegistroOficial.count({
          where: { id: { startsWith: 'lote-ingesta-concurrente-' } },
        }),
      ).toBe(2);
      const normas = await prisma.norma.findMany({
        where: { id: { startsWith: 'norma-ingesta-concurrente-' } },
      });
      expect(normas).toHaveLength(2);
      expect(
        normas.every(
          (norma) =>
            norma.edicionRegistroOficialId === edicionManual.id,
        ),
      ).toBe(true);
      expect(
        await prisma.edicionRegistroOficial.count({
          where: {
            tipoPublicacionRegistroOficial: 'SRO',
            numeroPublicacionRegistroOficial: 906,
            fechaPublicacionOficial: new Date('2026-07-06T00:00:00.000Z'),
          },
        }),
      ).toBe(1);
      const persistida = await repositorioEdiciones.buscarPorId(
        edicionManual.id,
      );
      expect(persistida?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
      expect(persistida?.urlPdf).toBe(edicionManual.urlPdf);
    });

    it('dos ingestas concurrentes crean una sola edición PENDIENTE cuando la triple aún no existe', async () => {
      const repositorioIngesta = new RepositorioIngestaRegistroOficialPrisma(
        prisma,
      );
      const crearIngesta = (sufijo: 'a' | 'b') => {
        const edicion = new EdicionRegistroOficial({
          id: `edicion-ingesta-triple-ausente-${sufijo}`,
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 907,
          fechaPublicacionOficial: new Date('2026-07-07T00:00:00.000Z'),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        });
        const norma = new Norma({
          id: `norma-ingesta-triple-ausente-${sufijo}`,
          numero: sufijo.toUpperCase(),
          titulo: `Norma concurrente con triple ausente ${sufijo}`,
          contenido: [],
          tipoNorma: 'Resolución',
          institucionExpide: 'Institución de prueba',
          estadoJuridico: EstadoNorma.VIGENTE,
          estadoEditorial: EstadoEditorialNorma.BORRADOR,
          fechaExpedicion: null,
          edicionRegistroOficialId: edicion.id,
          fechaPublicacionEnSistema: null,
        });
        return {
          lote: {
            id: `lote-ingesta-triple-ausente-${sufijo}`,
            huellaLote: `huella-triple-ausente-${sufijo}`,
            periodoAnio: 2026,
            periodoMes: sufijo === 'a' ? 9 : 10,
            fechaEjecucion: new Date('2026-07-10T00:00:00.000Z'),
            urlResumenMensualRegistroOficial:
              `https://www.registroficial.gob.ec/resumen-triple-ausente-${sufijo}.pdf`,
            versionExtractor: 'fase-5a-test',
          },
          ediciones: [edicion],
          normas: [norma],
          entradas: [],
        };
      };

      const resultados = await Promise.all([
        repositorioIngesta.guardarIngesta(crearIngesta('a')),
        repositorioIngesta.guardarIngesta(crearIngesta('b')),
      ]);

      expect(resultados).toEqual([{ exitoso: true }, { exitoso: true }]);
      expect(
        await prisma.loteIngestaRegistroOficial.count({
          where: { id: { startsWith: 'lote-ingesta-triple-ausente-' } },
        }),
      ).toBe(2);
      const normas = await prisma.norma.findMany({
        where: { id: { startsWith: 'norma-ingesta-triple-ausente-' } },
      });
      expect(normas).toHaveLength(2);
      const idsEdicion = new Set(
        normas.map((norma) => norma.edicionRegistroOficialId),
      );
      expect(idsEdicion.size).toBe(1);
      const [edicionId] = [...idsEdicion];
      expect(edicionId).not.toBeNull();
      const ediciones = await prisma.edicionRegistroOficial.findMany({
        where: {
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 907,
          fechaPublicacionOficial: new Date('2026-07-07T00:00:00.000Z'),
        },
      });
      expect(ediciones).toHaveLength(1);
      expect(ediciones[0].id).toBe(edicionId);
      expect(ediciones[0].estadoResolucionFuente).toBe('PENDIENTE');
      expect(ediciones[0].urlPdf).toBeNull();
    });

    it('RepositorioIngestaRegistroOficialPrisma protege un único lote por año y mes', async () => {
      const repositorio = new RepositorioIngestaRegistroOficialPrisma(prisma);
      const primera = await repositorio.guardarIngesta({
        lote: {
          id: 'lote-periodo-unico-a',
          huellaLote: 'huella-periodo-unico-a',
          periodoAnio: 2026,
          periodoMes: 11,
          fechaEjecucion: new Date('2026-11-01T00:00:00.000Z'),
          urlResumenMensualRegistroOficial:
            'https://www.registroficial.gob.ec/resumen-2026-11.pdf',
          versionExtractor: 'fase-5a-test',
        },
        ediciones: [],
        normas: [],
        entradas: [],
      });
      const segunda = await repositorio.guardarIngesta({
        lote: {
          id: 'lote-periodo-unico-b',
          huellaLote: 'huella-periodo-unico-b',
          periodoAnio: 2026,
          periodoMes: 11,
          fechaEjecucion: new Date('2026-11-02T00:00:00.000Z'),
          urlResumenMensualRegistroOficial:
            'https://www.registroficial.gob.ec/resumen-2026-11-corregido.pdf',
          versionExtractor: 'fase-5a-test',
        },
        ediciones: [],
        normas: [],
        entradas: [],
      });

      expect(primera).toEqual({ exitoso: true });
      expect(segunda).toEqual({
        exitoso: false,
        razon: 'LOTE_YA_REGISTRADO',
      });
      expect(await repositorio.buscarLotePorPeriodo(2026, 11)).toEqual(
        expect.objectContaining({ id: 'lote-periodo-unico-a' }),
      );
    });

    it('PostgreSQL impide dos ediciones con la misma clave lógica (unique triple)', async () => {
      await expect(
        prisma.edicionRegistroOficial.create({
          data: {
            id: 'edicion-clave-duplicada',
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: 500,
            fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
            urlPdf: null,
            estadoResolucionFuente: 'PENDIENTE',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('fecha_publicacion_oficial de la edición es PostgreSQL DATE', async () => {
      const columnas = await prisma.$queryRaw<
        Array<{ data_type: string }>
      >`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'ediciones_registro_oficial'
          AND column_name = 'fecha_publicacion_oficial'
      `;

      expect(columnas).toEqual([{ data_type: 'date' }]);
    });

    it('PostgreSQL normaliza una hora accidental al día y protege la triple completa', async () => {
      await prisma.edicionRegistroOficial.create({
        data: {
          id: 'edicion-fecha-calendario-a',
          tipoPublicacionRegistroOficial: 'EE',
          numeroPublicacionRegistroOficial: 990,
          fechaPublicacionOficial: new Date('2026-05-02T18:45:12.123Z'),
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        },
      });

      const persistida = await prisma.edicionRegistroOficial.findUniqueOrThrow({
        where: { id: 'edicion-fecha-calendario-a' },
      });
      expect(persistida.fechaPublicacionOficial.toISOString()).toBe(
        '2026-05-02T00:00:00.000Z',
      );

      await expect(
        prisma.edicionRegistroOficial.create({
          data: {
            id: 'edicion-fecha-calendario-b',
            tipoPublicacionRegistroOficial: 'EE',
            numeroPublicacionRegistroOficial: 990,
            fechaPublicacionOficial: new Date('2026-05-02T23:59:59.999Z'),
            urlPdf: null,
            estadoResolucionFuente: 'PENDIENTE',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('PostgreSQL rechaza normas que apunten a una edición inexistente (FK)', async () => {
      await expect(
        prisma.norma.create({
          data: {
            id: 'norma-edicion-fantasma',
            titulo: 'Norma con edición fantasma',
            contenido: [],
            tipoNorma: 'Ley',
            institucionExpide: 'Asamblea Nacional',
            estadoEditorial: 'BORRADOR',
            edicionRegistroOficialId: 'edicion-fantasma',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
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

    it('UnidadDeTrabajoPublicacionNormaPrisma no publica ni deja evento si la norma no existe', async () => {
      const unidadDeTrabajo = new UnidadDeTrabajoPublicacionNormaPrisma(
        prisma,
        () => 'evento-sin-norma',
      );
      const fechaPublicacionEnSistema = new Date('2025-06-01T00:00:00.000Z');
      const normaNuncaGuardada = crearNormaBorrador('norma-nunca-guardada');

      // La actualización condicionada afecta cero filas: conflicto tipado
      // (el caso de uso ya reportó NORMA_NO_ENCONTRADA en su propia lectura).
      const resultado = await unidadDeTrabajo.guardarNormaPublicadaConEvento(
        normaNuncaGuardada.publicar(fechaPublicacionEnSistema),
        {
          normaId: normaNuncaGuardada.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: false,
        },
      );

      expect(resultado).toEqual({
        publicada: false,
        razon: 'NORMA_YA_PUBLICADA',
      });
      const eventos = await prisma.eventoNormaPublicada.findMany();
      expect(eventos).toHaveLength(0);
    });

    function crearNormaBorrador(id: string): Norma {
      return new Norma({
        id,
        numero: null,
        titulo: `Norma ${id}`,
        contenido: [],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
        edicionRegistroOficialId: 'edicion-prueba',
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

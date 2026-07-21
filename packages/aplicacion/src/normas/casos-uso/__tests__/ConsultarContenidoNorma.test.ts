import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  EstadoSuscripcion,
  Norma,
  RolUsuario,
  Suscripcion,
  Usuario,
} from '@normativo/dominio';
import { ConsultarContenidoNorma } from '../ConsultarContenidoNorma';
import { RepositorioSuscripciones } from '../../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../../puertos/RepositorioUsuarios';
import {
  crearEdicionRegistroOficial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

const URL_FUENTE_EDICION =
  'https://www.registroficial.gob.ec/ediciones/ro-500.pdf';

class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    return this.usuariosPorId.get(id) ?? null;
  }
}

class RepositorioSuscripcionesEnMemoria implements RepositorioSuscripciones {
  private readonly suscripciones: Suscripcion[] = [];

  agregar(suscripcion: Suscripcion): void {
    this.suscripciones.push(suscripcion);
  }

  async buscarPorCorreoHabilitado(correo: string): Promise<Suscripcion | null> {
    const correoNormalizado = correo.trim().toLowerCase();
    const encontrada = this.suscripciones.find((suscripcion) =>
      suscripcion.correosUsuariosHabilitados.includes(correoNormalizado),
    );
    return encontrada ?? null;
  }
}

interface OpcionesUsuario {
  id?: string;
  rol?: RolUsuario;
  correo?: string;
}

function crearUsuario(opciones: OpcionesUsuario = {}): Usuario {
  const id = opciones.id ?? 'u-1';
  return new Usuario({
    id,
    nombre: `Usuario ${id}`,
    apellido: 'Acceso',
    correo: opciones.correo ?? `${id}@test.com`,
    rol: opciones.rol ?? RolUsuario.SUSCRIPTOR,
  });
}

interface OpcionesSuscripcion {
  id?: string;
  correoHabilitado: string;
  estado?: EstadoSuscripcion;
  fechaInicio?: Date;
  fechaFin?: Date;
}

function crearSuscripcion(opciones: OpcionesSuscripcion): Suscripcion {
  const id = opciones.id ?? 's-1';
  return new Suscripcion({
    id,
    clienteId: `cliente-${id}`,
    correosUsuariosHabilitados: [opciones.correoHabilitado],
    cantidadMaximaUsuarios: 1,
    estado: opciones.estado ?? EstadoSuscripcion.ACTIVA,
    fechaInicio: opciones.fechaInicio ?? new Date('2025-01-01'),
    fechaFin: opciones.fechaFin ?? new Date('2030-01-01'),
  });
}

interface OpcionesNorma {
  id?: string;
  estadoJuridico?: EstadoNorma;
  estadoEditorial?: EstadoEditorialNorma;
  contenido?: string[];
}

function crearNorma(opciones: OpcionesNorma = {}): Norma {
  const id = opciones.id ?? 'n-1';
  const estadoEditorial = opciones.estadoEditorial ?? EstadoEditorialNorma.PUBLICADA;

  return new Norma({
    id,
    numero: `RO-${id}`,
    titulo: `Norma ${id}`,
    contenido: opciones.contenido ?? [`Contenido de la norma ${id}`],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: opciones.estadoJuridico ?? EstadoNorma.VIGENTE,
    estadoEditorial,
    fechaExpedicion: new Date('2025-01-01'),
    edicionRegistroOficialId: 'edicion-1',
    fechaPublicacionEnSistema:
      estadoEditorial === EstadoEditorialNorma.PUBLICADA
        ? new Date('2025-01-03')
        : null,
  });
}

interface ContextoCasoUso {
  casoUso: ConsultarContenidoNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoria;
  repositorioNormas: RepositorioNormasEnMemoriaFake;
  repositorioSuscripciones: RepositorioSuscripcionesEnMemoria;
  repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
}

function crearContexto(): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoria();
  const repositorioNormas = new RepositorioNormasEnMemoriaFake();
  const repositorioSuscripciones = new RepositorioSuscripcionesEnMemoria();
  const repositorioEdiciones =
    new RepositorioEdicionesRegistroOficialEnMemoriaFake();
  repositorioEdiciones.agregar(
    crearEdicionRegistroOficial({ urlPdf: URL_FUENTE_EDICION }),
  );
  const casoUso = new ConsultarContenidoNorma({
    repositorioUsuarios,
    repositorioNormas,
    repositorioSuscripciones,
    repositorioEdiciones,
    consultorCambiosEdicion: repositorioNormas,
  });
  return {
    casoUso,
    repositorioUsuarios,
    repositorioNormas,
    repositorioSuscripciones,
    repositorioEdiciones,
  };
}

const fechaReferencia = new Date('2025-06-01');

describe('ConsultarContenidoNorma', () => {
  it('devuelve contenido completo cuando usuario, norma y suscripción cumplen la regla', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma();

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.contenido.id).toBe(norma.id);
      expect(resultado.contenido.contenido).toEqual(norma.contenido);
    }
  });

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si usuarioAutenticadoId es "%s"',
    async (usuarioAutenticadoId) => {
      const contexto = crearContexto();

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId,
        normaId: 'n-1',
        fechaReferencia,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si normaId es "%s"',
    async (normaId) => {
      const contexto = crearContexto();

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: 'u-1',
        normaId,
        fechaReferencia,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it('devuelve USUARIO_NO_ENCONTRADO si no existe usuario', async () => {
    const contexto = crearContexto();
    const norma = crearNorma();
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: 'u-inexistente',
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' });
  });

  it('devuelve NORMA_NO_ENCONTRADA si no existe norma', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    contexto.repositorioUsuarios.agregar(usuario);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: 'n-inexistente',
      fechaReferencia,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_NO_ENCONTRADA' });
  });

  it('devuelve SUSCRIPCION_NO_ENCONTRADA si no existe suscripción para el correo del usuario', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma();
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'SUSCRIPCION_NO_ENCONTRADA',
    });
  });

  it('devuelve ACCESO_DENEGADO si la suscripción no habilita el correo', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario({ correo: 'usuario@test.com' });
    const norma = crearNorma();
    const suscripcionAjena = crearSuscripcion({
      id: 's-ajena',
      correoHabilitado: 'otro@test.com',
    });

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const repositorioSuscripcionesPermisivo: RepositorioSuscripciones = {
      buscarPorCorreoHabilitado: async () => suscripcionAjena,
    };

    const casoUso = new ConsultarContenidoNorma({
      repositorioUsuarios: contexto.repositorioUsuarios,
      repositorioNormas: contexto.repositorioNormas,
      repositorioSuscripciones: repositorioSuscripcionesPermisivo,
      repositorioEdiciones: contexto.repositorioEdiciones,
      consultorCambiosEdicion: contexto.repositorioNormas,
    });

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
  });

  it.each([
    EstadoSuscripcion.INACTIVA,
    EstadoSuscripcion.VENCIDA,
    EstadoSuscripcion.CANCELADA,
  ])('devuelve ACCESO_DENEGADO si la suscripción está %s', async (estado) => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
      estado,
    });

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
  });

  it('devuelve ACCESO_DENEGADO si la suscripción está fuera de vigencia', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2030-01-01'),
    });

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
  });

  it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
    'devuelve ACCESO_DENEGADO si la norma está %s',
    async (estadoEditorial) => {
      const contexto = crearContexto();
      const usuario = crearUsuario();
      const norma = crearNorma({ estadoEditorial });
      const suscripcion = crearSuscripcion({
        correoHabilitado: usuario.obtenerCorreo(),
      });

      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);
      contexto.repositorioSuscripciones.agregar(suscripcion);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaReferencia,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it.each([
    RolUsuario.SUPERADMINISTRADOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.EDITOR,
    RolUsuario.SUSCRIPTOR,
  ])(
    'permite acceso para rol %s si cumple suscripción activa/vigente y correo habilitado',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ id: `u-${rol}`, rol });
      const suscripcion = crearSuscripcion({
        id: `s-${rol}`,
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma({ id: `n-${rol}` });

      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);
      contexto.repositorioSuscripciones.agregar(suscripcion);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaReferencia,
      });

      expect(resultado.exitoso).toBe(true);
    },
  );

  it.each([EstadoNorma.VIGENTE, EstadoNorma.REFORMADA, EstadoNorma.DEROGADA])(
    'permite consultar normas con estado jurídico %s si están PUBLICADA y hay acceso por suscripción',
    async (estadoJuridico) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ id: `u-${estadoJuridico}` });
      const suscripcion = crearSuscripcion({
        id: `s-${estadoJuridico}`,
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma({
        id: `n-${estadoJuridico}`,
        estadoJuridico,
      });

      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);
      contexto.repositorioSuscripciones.agregar(suscripcion);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaReferencia,
      });

      expect(resultado.exitoso).toBe(true);
      if (resultado.exitoso) {
        expect(resultado.contenido.estadoJuridico).toBe(estadoJuridico);
      }
    },
  );

  it('devuelve el contenido completo de la norma con todos los campos esperados', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma();

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.contenido).toEqual({
        id: norma.id,
        numero: norma.numero,
        titulo: norma.titulo,
        contenido: norma.contenido,
        tieneContenidoCompleto: true,
        tipoNorma: norma.tipoNorma,
        institucionExpide: norma.institucionExpide,
        estadoJuridico: norma.estadoJuridico,
        fechaExpedicion: '2025-01-01',
        edicionesRegistroOficial: [
          {
            tipoRelacion: 'PRINCIPAL',
            id: 'edicion-1',
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: 500,
            fechaPublicacionOficial: '2026-05-02',
            fuente: URL_FUENTE_EDICION,
          },
        ],
      });
      // Nunca campos singulares de edición en la salida del suscriptor.
      for (const singular of [
        'fuente',
        'fechaPublicacionOficial',
        'estadoResolucionFuente',
        'origenRegistroOficial',
        'estadoEditorial',
        'fechaPublicacionEnSistema',
      ]) {
        expect(resultado.contenido).not.toHaveProperty(singular);
      }
    }
  });

  it('no expone fechaPublicacionEnSistema en la salida exitosa', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma();

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(Object.keys(resultado.contenido)).not.toContain(
        'fechaPublicacionEnSistema',
      );
      expect(resultado.contenido.edicionesRegistroOficial[0].fuente).toBe(
        URL_FUENTE_EDICION,
      );
    }
  });

  it('no expone estadoEditorial en la salida exitosa', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma();

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(Object.keys(resultado.contenido)).not.toContain('estadoEditorial');
    }
  });

  it('marca tieneContenidoCompleto en true cuando la norma tiene contenido', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma({ contenido: ['Texto completo de la norma'] });

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.contenido.tieneContenidoCompleto).toBe(true);
    }
  });

  it('marca tieneContenidoCompleto en false cuando una norma PUBLICADA tiene contenido []', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const suscripcion = crearSuscripcion({
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma({ contenido: [] });

    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);
    contexto.repositorioSuscripciones.agregar(suscripcion);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaReferencia,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.contenido.tieneContenidoCompleto).toBe(false);
      expect(resultado.contenido.contenido).toEqual([]);
      expect(resultado.contenido.edicionesRegistroOficial[0].fuente).toBe(
        URL_FUENTE_EDICION,
      );
    }
  });

  it.each([RolUsuario.SUSCRIPTOR, RolUsuario.ADMINISTRADOR])(
    '%s con suscripción ve principal y solo cambios publicables, sin estados internos',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ id: `usuario-${rol}`, rol });
      const norma = crearNorma({ id: `norma-${rol}` });
      const suscripcion = crearSuscripcion({
        id: `suscripcion-${rol}`,
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const cambios = [
        crearEdicionRegistroOficial({
          id: 'cambio-resuelto',
          numeroPublicacionRegistroOficial: 501,
          fechaPublicacionOficial: new Date('2026-06-01'),
          urlPdf: 'https://registroficial.gob.ec/cambio-resuelto.pdf',
          estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
        }),
        crearEdicionRegistroOficial({
          id: 'cambio-manual',
          numeroPublicacionRegistroOficial: 502,
          fechaPublicacionOficial: new Date('2026-07-01'),
          urlPdf: 'https://registroficial.gob.ec/cambio-manual.pdf',
          estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
        }),
        crearEdicionRegistroOficial({
          id: 'cambio-pendiente',
          numeroPublicacionRegistroOficial: 503,
          fechaPublicacionOficial: new Date('2026-08-01'),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        }),
        crearEdicionRegistroOficial({
          id: 'cambio-conflictivo',
          numeroPublicacionRegistroOficial: 504,
          fechaPublicacionOficial: new Date('2026-09-01'),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.CONFLICTIVA,
        }),
      ];
      for (const cambio of cambios) {
        contexto.repositorioEdiciones.agregar(cambio);
        contexto.repositorioNormas.agregarCambio(norma.id, cambio.id);
      }
      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);
      contexto.repositorioSuscripciones.agregar(suscripcion);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaReferencia,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(
        resultado.contenido.edicionesRegistroOficial.map((edicion) => [
          edicion.tipoRelacion,
          edicion.id,
        ]),
      ).toEqual([
        ['PRINCIPAL', 'edicion-1'],
        ['CAMBIO', 'cambio-resuelto'],
        ['CAMBIO', 'cambio-manual'],
      ]);
      expect(resultado.contenido).not.toHaveProperty('estadoResolucionFuente');
      expect(resultado.contenido).not.toHaveProperty('origenRegistroOficial');
      expect(resultado.contenido).not.toHaveProperty('edicionRegistroOficialId');
    },
  );
});

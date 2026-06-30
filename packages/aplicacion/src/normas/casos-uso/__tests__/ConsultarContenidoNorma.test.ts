import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoSuscripcion,
  Norma,
  RolUsuario,
  Suscripcion,
  Usuario,
} from '@normativo/dominio';
import { ConsultarContenidoNorma } from '../ConsultarContenidoNorma';
import { RepositorioNormas } from '../../puertos/RepositorioNormas';
import { RepositorioSuscripciones } from '../../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../../puertos/RepositorioUsuarios';

class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    return this.usuariosPorId.get(id) ?? null;
  }
}

class RepositorioNormasEnMemoria implements RepositorioNormas {
  private readonly normasPorId = new Map<string, Norma>();

  agregar(norma: Norma): void {
    this.normasPorId.set(norma.id, norma);
  }

  async buscarPorId(id: string): Promise<Norma | null> {
    return this.normasPorId.get(id) ?? null;
  }

  async guardar(norma: Norma): Promise<void> {
    this.normasPorId.set(norma.id, norma);
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
  contenido?: string;
}

function crearNorma(opciones: OpcionesNorma = {}): Norma {
  const id = opciones.id ?? 'n-1';
  const estadoEditorial = opciones.estadoEditorial ?? EstadoEditorialNorma.PUBLICADA;

  return new Norma({
    id,
    numero: `RO-${id}`,
    titulo: `Norma ${id}`,
    contenido: opciones.contenido ?? `Contenido de la norma ${id}`,
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: `https://www.registroficial.gob.ec/${id}.pdf`,
    estadoJuridico: opciones.estadoJuridico ?? EstadoNorma.VIGENTE,
    estadoEditorial,
    fechaExpedicion: new Date('2025-01-01'),
    fechaPublicacionOficial: new Date('2025-01-02'),
    fechaPublicacionEnSistema:
      estadoEditorial === EstadoEditorialNorma.PUBLICADA
        ? new Date('2025-01-03')
        : null,
  });
}

interface ContextoCasoUso {
  casoUso: ConsultarContenidoNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoria;
  repositorioNormas: RepositorioNormasEnMemoria;
  repositorioSuscripciones: RepositorioSuscripcionesEnMemoria;
}

function crearContexto(): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoria();
  const repositorioNormas = new RepositorioNormasEnMemoria();
  const repositorioSuscripciones = new RepositorioSuscripcionesEnMemoria();
  const casoUso = new ConsultarContenidoNorma({
    repositorioUsuarios,
    repositorioNormas,
    repositorioSuscripciones,
  });
  return {
    casoUso,
    repositorioUsuarios,
    repositorioNormas,
    repositorioSuscripciones,
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
      expect(resultado.contenido.contenido).toBe(norma.contenido);
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
        fuente: norma.fuente,
        estadoJuridico: norma.estadoJuridico,
        fechaExpedicion: norma.fechaExpedicion,
        fechaPublicacionOficial: norma.fechaPublicacionOficial,
      });
      expect(resultado.contenido.fuente).toBe(norma.fuente);
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
      expect(resultado.contenido.fuente).toBe(norma.fuente);
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
    const norma = crearNorma({ contenido: 'Texto completo de la norma' });

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

  it.each(['', '   '])(
    'marca tieneContenidoCompleto en false cuando una norma PUBLICADA tiene contenido "%s"',
    async (contenido) => {
      const contexto = crearContexto();
      const usuario = crearUsuario();
      const suscripcion = crearSuscripcion({
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma({ contenido });

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
        expect(resultado.contenido.contenido).toBe(contenido);
        expect(resultado.contenido.fuente).toBe(norma.fuente);
      }
    },
  );
});

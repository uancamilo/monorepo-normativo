import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import { PublicarNorma } from '../PublicarNorma';
import { EventoNormaPublicada } from '../../puertos/PublicadorEventosNormas';
import { UnidadDeTrabajoPublicacionNorma } from '../../puertos/UnidadDeTrabajoPublicacionNorma';
import {
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  PublicadorEventosEnMemoriaFake,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
  UnidadDeTrabajoPublicacionNormaFake,
} from './apoyo/fakes-normas-editorial';

class UnidadDeTrabajoPublicacionFallida
  implements UnidadDeTrabajoPublicacionNorma
{
  intentos: Array<{
    normaPublicada: Norma;
    evento: EventoNormaPublicada;
  }> = [];

  readonly error = new Error(
    'Fallo transaccional al guardar norma publicada con evento',
  );

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<never> {
    this.intentos.push({ normaPublicada, evento });
    throw this.error;
  }
}

/** Simula perder la carrera: otra publicación concurrente ganó primero. */
class UnidadDeTrabajoCarreraPerdida
  implements UnidadDeTrabajoPublicacionNorma
{
  llamadas = 0;

  async guardarNormaPublicadaConEvento(): Promise<{
    publicada: false;
    razon: 'NORMA_YA_PUBLICADA';
  }> {
    this.llamadas += 1;
    return { publicada: false, razon: 'NORMA_YA_PUBLICADA' };
  }
}

/**
 * Simula la barrera atómica de la unidad de trabajo: la norma sigue en
 * BORRADOR pero una modificación concurrente invalidó las precondiciones
 * (campo obligatorio vaciado o edición cambiada a no publicable).
 */
class UnidadDeTrabajoModificadaConcurrentemente
  implements UnidadDeTrabajoPublicacionNorma
{
  llamadas = 0;

  async guardarNormaPublicadaConEvento(): Promise<{
    publicada: false;
    razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE';
  }> {
    this.llamadas += 1;
    return { publicada: false, razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE' };
  }
}

/** Confirma un contenido vigente distinto del observado antes de publicar. */
class UnidadDeTrabajoContenidoVigente
  implements UnidadDeTrabajoPublicacionNorma
{
  async guardarNormaPublicadaConEvento() {
    return {
      publicada: true as const,
      tieneContenidoCompleto: true,
    };
  }
}

interface OpcionesUsuario {
  id?: string;
  rol?: RolUsuario;
}

function crearUsuario(opciones: OpcionesUsuario = {}): Usuario {
  const id = opciones.id ?? 'u-1';
  return new Usuario({
    id,
    nombre: `Usuario ${id}`,
    apellido: 'Editorial',
    correo: `${id}@test.com`,
    rol: opciones.rol ?? RolUsuario.EDITOR,
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
  const estadoEditorial = opciones.estadoEditorial ?? EstadoEditorialNorma.BORRADOR;
  const publicada = estadoEditorial === EstadoEditorialNorma.PUBLICADA;

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
    fechaPublicacionEnSistema: publicada ? new Date('2025-01-03') : null,
  });
}

interface ContextoCasoUso {
  casoUso: PublicarNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  repositorioNormas: RepositorioNormasEnMemoriaFake;
  repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  publicador: PublicadorEventosEnMemoriaFake;
}

function crearContexto(): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
  const repositorioNormas = new RepositorioNormasEnMemoriaFake();
  const repositorioEdiciones =
    new RepositorioEdicionesRegistroOficialEnMemoriaFake();
  const publicador = new PublicadorEventosEnMemoriaFake();
  // La edición asociada por defecto es publicable (RESUELTA con urlPdf).
  repositorioEdiciones.agregar(crearEdicionRegistroOficial());
  const casoUso = new PublicarNorma({
    repositorioUsuarios,
    repositorioNormas,
    repositorioEdiciones,
    unidadDeTrabajoPublicacionNorma: new UnidadDeTrabajoPublicacionNormaFake(
      repositorioNormas,
      publicador,
    ),
  });
  return {
    casoUso,
    repositorioUsuarios,
    repositorioNormas,
    repositorioEdiciones,
    publicador,
  };
}

const fechaPublicacion = new Date('2025-06-01');

describe('PublicarNorma', () => {
  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    'permite que %s publique una norma BORRADOR',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ rol });
      const norma = crearNorma();
      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaPublicacionEnSistema: fechaPublicacion,
      });

      expect(resultado.exitoso).toBe(true);
      if (resultado.exitoso) {
        expect(resultado.norma.id).toBe(norma.id);
        expect(resultado.norma.estadoEditorial).toBe(
          EstadoEditorialNorma.PUBLICADA,
        );
        expect(resultado.norma.fechaPublicacionEnSistema).toBe(fechaPublicacion);
      }
    },
  );

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    'devuelve ACCESO_DENEGADO para %s',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ rol });
      const norma = crearNorma();
      contexto.repositorioUsuarios.agregar(usuario);
      contexto.repositorioNormas.agregar(norma);

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
      expect(contexto.publicador.eventos).toHaveLength(0);
    },
  );

  it('devuelve USUARIO_NO_ENCONTRADO si el usuario no existe', async () => {
    const contexto = crearContexto();
    const norma = crearNorma();
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: 'u-inexistente',
      normaId: norma.id,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    expect(contexto.publicador.eventos).toHaveLength(0);
  });

  it('devuelve NORMA_NO_ENCONTRADA si la norma no existe', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    contexto.repositorioUsuarios.agregar(usuario);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: 'n-inexistente',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_NO_ENCONTRADA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    expect(contexto.publicador.eventos).toHaveLength(0);
  });

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si usuarioAutenticadoId es "%s"',
    async (usuarioAutenticadoId) => {
      const contexto = crearContexto();

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId,
        normaId: 'n-1',
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
      expect(contexto.publicador.eventos).toHaveLength(0);
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si normaId es "%s"',
    async (normaId) => {
      const contexto = crearContexto();

      const resultado = await contexto.casoUso.ejecutar({
        usuarioAutenticadoId: 'u-1',
        normaId,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it('devuelve SOLICITUD_INVALIDA si la fecha de publicación es inválida', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma();
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: new Date('fecha-inválida'),
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    expect(contexto.publicador.eventos).toHaveLength(0);
  });

  it('devuelve NORMA_YA_PUBLICADA si la norma ya está publicada', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ estadoEditorial: EstadoEditorialNorma.PUBLICADA });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_YA_PUBLICADA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    expect(contexto.publicador.eventos).toHaveLength(0);
  });

  it('guarda la norma PUBLICADA y conserva estado jurídico y edición asociada', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ estadoJuridico: EstadoNorma.REFORMADA });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
    const guardada = contexto.repositorioNormas.guardadas[0];
    expect(guardada.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
    expect(guardada.fechaPublicacionEnSistema).toBe(fechaPublicacion);
    expect(guardada.estadoJuridico).toBe(EstadoNorma.REFORMADA);
    expect(guardada.edicionRegistroOficialId).toBe('edicion-1');
  });

  it('retorna tieneContenidoCompleto true cuando hay contenido estructurado', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: ['Texto completo'] });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(true);
    }
  });

  it('retorna tieneContenidoCompleto false cuando el contenido es []', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: [] });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    const resultado = await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(false);
    }
  });

  it('devuelve tieneContenidoCompleto confirmado por la unidad de trabajo y no el de la copia obsoleta', async () => {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    const repositorioNormas = new RepositorioNormasEnMemoriaFake();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: new UnidadDeTrabajoContenidoVigente(),
    });
    const usuario = crearUsuario();
    const copiaSinContenido = crearNorma({ contenido: [] });
    repositorioUsuarios.agregar(usuario);
    repositorioNormas.agregar(copiaSinContenido);

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: copiaSinContenido.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(true);
    }
  });

  it('publica el evento exactamente una vez con los datos esperados', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: ['Texto completo'] });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(contexto.publicador.eventos).toHaveLength(1);
    expect(contexto.publicador.eventos[0]).toEqual({
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
      tieneContenidoCompleto: true,
    });
  });

  it('publica un evento con tieneContenidoCompleto false para contenido []', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: [] });
    contexto.repositorioUsuarios.agregar(usuario);
    contexto.repositorioNormas.agregar(norma);

    await contexto.casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(contexto.publicador.eventos).toHaveLength(1);
    expect(contexto.publicador.eventos[0].tieneContenidoCompleto).toBe(false);
  });

  it('devuelve NORMA_YA_PUBLICADA si la unidad de trabajo pierde la carrera de publicación', async () => {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    const repositorioNormas = new RepositorioNormasEnMemoriaFake();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    const unidadDeTrabajoPublicacionNorma = new UnidadDeTrabajoCarreraPerdida();
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma,
    });
    const usuario = crearUsuario();
    const norma = crearNorma();
    repositorioUsuarios.agregar(usuario);
    repositorioNormas.agregar(norma);

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_YA_PUBLICADA' });
    expect(unidadDeTrabajoPublicacionNorma.llamadas).toBe(1);
  });

  it('devuelve NORMA_MODIFICADA_CONCURRENTEMENTE si la unidad detecta que la norma dejó de cumplir las precondiciones', async () => {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    const repositorioNormas = new RepositorioNormasEnMemoriaFake();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    const unidadDeTrabajoPublicacionNorma =
      new UnidadDeTrabajoModificadaConcurrentemente();
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma,
    });
    const usuario = crearUsuario();
    const norma = crearNorma();
    repositorioUsuarios.agregar(usuario);
    repositorioNormas.agregar(norma);

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: usuario.obtenerId(),
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
    });
    expect(unidadDeTrabajoPublicacionNorma.llamadas).toBe(1);
  });

  it('propaga el error si falla la unidad transaccional y no deja la norma publicada ni evento', async () => {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    const repositorioNormas = new RepositorioNormasEnMemoriaFake();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    const unidadDeTrabajoPublicacionNorma =
      new UnidadDeTrabajoPublicacionFallida();
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma,
    });
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: ['Texto completo'] });
    repositorioUsuarios.agregar(usuario);
    repositorioNormas.agregar(norma);

    await expect(
      casoUso.ejecutar({
        usuarioAutenticadoId: usuario.obtenerId(),
        normaId: norma.id,
        fechaPublicacionEnSistema: fechaPublicacion,
      }),
    ).rejects.toBe(unidadDeTrabajoPublicacionNorma.error);

    expect(repositorioNormas.guardadas).toHaveLength(0);
    const normaPersistida = await repositorioNormas.buscarPorId(norma.id);
    expect(normaPersistida?.estadoEditorial).toBe(
      EstadoEditorialNorma.BORRADOR,
    );
    expect(unidadDeTrabajoPublicacionNorma.intentos).toHaveLength(1);
    expect(unidadDeTrabajoPublicacionNorma.intentos[0].evento).toEqual({
      normaId: norma.id,
      fechaPublicacionEnSistema: fechaPublicacion,
      tieneContenidoCompleto: true,
    });
  });
});

describe('PublicarNorma — obligatorios de publicación', () => {
  function crearContextoEditorial() {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    const repositorioNormas = new RepositorioNormasEnMemoriaFake();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    const publicador = new PublicadorEventosEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: new UnidadDeTrabajoPublicacionNormaFake(
        repositorioNormas,
        publicador,
      ),
    });
    repositorioUsuarios.agregar(crearUsuarioEditorial(RolUsuario.EDITOR));
    return { casoUso, repositorioNormas, repositorioEdiciones, publicador };
  }

  it.each([
    [{ tipoNorma: '' }, 'TIPO_NORMA_REQUERIDO'],
    [{ titulo: '' }, 'TITULO_REQUERIDO'],
    [{ institucionExpide: '' }, 'INSTITUCION_EXPIDE_REQUERIDA'],
    [{ estadoJuridico: null }, 'ESTADO_JURIDICO_REQUERIDO'],
    [
      { edicionRegistroOficialId: null },
      'EDICION_REGISTRO_OFICIAL_REQUERIDA',
    ],
  ] as Array<[Record<string, unknown>, string]>)(
    'bloquea la publicación con %j -> %s',
    async (overrides, razonEsperada) => {
      const { casoUso, repositorioNormas, publicador } = crearContextoEditorial();
      repositorioNormas.agregar(crearNormaEditorial(overrides));

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-EDITOR',
        normaId: 'norma-1',
      });

      expect(resultado).toEqual({ exitoso: false, razon: razonEsperada });
      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.estaPublicada()).toBe(false);
      expect(publicador.eventos).toHaveLength(0);
    },
  );

  it('bloquea la publicación si la edición asociada no existe', async () => {
    const { casoUso, repositorioNormas, publicador } = crearContextoEditorial();
    repositorioNormas.agregar(
      crearNormaEditorial({ edicionRegistroOficialId: 'edicion-fantasma' }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_REGISTRO_OFICIAL_REQUERIDA',
    });
    expect(publicador.eventos).toHaveLength(0);
  });

  it.each([
    EstadoResolucionFuente.PENDIENTE,
    EstadoResolucionFuente.NO_ENCONTRADA,
    EstadoResolucionFuente.CONFLICTIVA,
  ])(
    'bloquea la publicación con FUENTE_REQUERIDA si la edición está %s (urlPdf null)',
    async (estadoResolucionFuente) => {
      const { casoUso, repositorioNormas, repositorioEdiciones, publicador } =
        crearContextoEditorial();
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          urlPdf: null,
          estadoResolucionFuente,
        }),
      );
      repositorioNormas.agregar(crearNormaEditorial());

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-EDITOR',
        normaId: 'norma-1',
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'FUENTE_REQUERIDA' });
      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.estaPublicada()).toBe(false);
      expect(publicador.eventos).toHaveLength(0);
    },
  );

  it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
    'permite publicar con la fuente de la edición en estado %s',
    async (estadoResolucionFuente) => {
      const { casoUso, repositorioNormas, repositorioEdiciones } =
        crearContextoEditorial();
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({ estadoResolucionFuente }),
      );
      repositorioNormas.agregar(crearNormaEditorial());

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-EDITOR',
        normaId: 'norma-1',
      });

      expect(resultado.exitoso).toBe(true);
    },
  );

  it('numero vacío, fechaExpedicion null y contenido [] no bloquean la publicación', async () => {
    const { casoUso, repositorioNormas } = crearContextoEditorial();
    repositorioNormas.agregar(
      crearNormaEditorial({
        numero: null,
        fechaExpedicion: null,
        contenido: [],
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      fechaPublicacionEnSistema: new Date('2026-06-01'),
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      expect(resultado.norma.fechaPublicacionEnSistema).toEqual(
        new Date('2026-06-01'),
      );
    }
  });
});

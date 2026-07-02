import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  Norma,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import { PublicarNorma } from '../PublicarNorma';
import { RepositorioNormas } from '../../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../../puertos/RepositorioUsuarios';
import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
} from '../../puertos/PublicadorEventosNormas';
import { UnidadDeTrabajoPublicacionNorma } from '../../puertos/UnidadDeTrabajoPublicacionNorma';

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
  guardadas: Norma[] = [];

  agregar(norma: Norma): void {
    this.normasPorId.set(norma.id, norma);
  }

  async buscarPorId(id: string): Promise<Norma | null> {
    return this.normasPorId.get(id) ?? null;
  }

  async guardar(norma: Norma): Promise<void> {
    this.normasPorId.set(norma.id, norma);
    this.guardadas.push(norma);
  }
}

class PublicadorEventosEnMemoria implements PublicadorEventosNormas {
  eventos: EventoNormaPublicada[] = [];

  async publicarNormaPublicada(evento: EventoNormaPublicada): Promise<void> {
    this.eventos.push(evento);
  }
}

class UnidadDeTrabajoPublicacionNormaEnMemoria
  implements UnidadDeTrabajoPublicacionNorma
{
  constructor(
    private readonly repositorioNormas: RepositorioNormasEnMemoria,
    private readonly publicadorEventosNormas: PublicadorEventosNormas,
  ) {}

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<void> {
    await this.repositorioNormas.guardar(normaPublicada);
    await this.publicadorEventosNormas.publicarNormaPublicada(evento);
  }
}

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
  ): Promise<void> {
    this.intentos.push({ normaPublicada, evento });
    throw this.error;
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
  contenido?: string;
}

function crearNorma(opciones: OpcionesNorma = {}): Norma {
  const id = opciones.id ?? 'n-1';
  const estadoEditorial = opciones.estadoEditorial ?? EstadoEditorialNorma.BORRADOR;
  const publicada = estadoEditorial === EstadoEditorialNorma.PUBLICADA;

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
    fechaPublicacionEnSistema: publicada ? new Date('2025-01-03') : null,
  });
}

interface ContextoCasoUso {
  casoUso: PublicarNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoria;
  repositorioNormas: RepositorioNormasEnMemoria;
  publicador: PublicadorEventosEnMemoria;
  unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNormaEnMemoria;
}

function crearContexto(): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoria();
  const repositorioNormas = new RepositorioNormasEnMemoria();
  const publicador = new PublicadorEventosEnMemoria();
  const unidadDeTrabajoPublicacionNorma =
    new UnidadDeTrabajoPublicacionNormaEnMemoria(
      repositorioNormas,
      publicador,
    );
  const casoUso = new PublicarNorma({
    repositorioUsuarios,
    repositorioNormas,
    unidadDeTrabajoPublicacionNorma,
  });
  return {
    casoUso,
    repositorioUsuarios,
    repositorioNormas,
    publicador,
    unidadDeTrabajoPublicacionNorma,
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

  it('guarda la norma con estadoEditorial PUBLICADA y conserva estado jurídico y fuente', async () => {
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
    expect(guardada.fuente).toBe(norma.fuente);
  });

  it('retorna tieneContenidoCompleto true cuando hay contenido no vacío', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: 'Texto completo' });
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

  it.each(['', '   '])(
    'retorna tieneContenidoCompleto false cuando el contenido es "%s"',
    async (contenido) => {
      const contexto = crearContexto();
      const usuario = crearUsuario();
      const norma = crearNorma({ contenido });
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
    },
  );

  it('publica el evento exactamente una vez con los datos esperados', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: 'Texto completo' });
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

  it('publica un evento con tieneContenidoCompleto false para contenido vacío', async () => {
    const contexto = crearContexto();
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: '   ' });
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

  it('propaga el error si falla la unidad transaccional y no deja la norma publicada ni evento', async () => {
    const repositorioUsuarios = new RepositorioUsuariosEnMemoria();
    const repositorioNormas = new RepositorioNormasEnMemoria();
    const unidadDeTrabajoPublicacionNorma =
      new UnidadDeTrabajoPublicacionFallida();
    const casoUso = new PublicarNorma({
      repositorioUsuarios,
      repositorioNormas,
      unidadDeTrabajoPublicacionNorma,
    });
    const usuario = crearUsuario();
    const norma = crearNorma({ contenido: 'Texto completo' });
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

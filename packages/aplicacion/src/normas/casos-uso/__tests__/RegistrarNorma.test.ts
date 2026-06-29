import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  Norma,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import { RegistrarNorma } from '../RegistrarNorma';
import type { SolicitudRegistrarNorma } from '../RegistrarNorma';
import { RepositorioNormas } from '../../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../../puertos/RepositorioUsuarios';
import { GeneradorIds } from '../../puertos/GeneradorIds';

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

class GeneradorIdsFake implements GeneradorIds {
  llamadas = 0;
  constructor(private readonly id: string = 'id-generado-1') {}

  generar(): string {
    this.llamadas += 1;
    return this.id;
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

function crearSolicitud(
  parcial: Partial<SolicitudRegistrarNorma> = {},
): SolicitudRegistrarNorma {
  return {
    usuarioAutenticadoId: 'u-1',
    titulo: 'Ley Orgánica de Prueba',
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: 'https://www.registroficial.gob.ec/norma.pdf',
    fechaExpedicion: new Date('2025-01-01'),
    fechaPublicacionOficial: new Date('2025-01-02'),
    ...parcial,
  };
}

interface ContextoCasoUso {
  casoUso: RegistrarNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoria;
  repositorioNormas: RepositorioNormasEnMemoria;
  generadorIds: GeneradorIdsFake;
}

function crearContexto(idGenerado = 'id-generado-1'): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoria();
  const repositorioNormas = new RepositorioNormasEnMemoria();
  const generadorIds = new GeneradorIdsFake(idGenerado);
  const casoUso = new RegistrarNorma({
    repositorioUsuarios,
    repositorioNormas,
    generadorIds,
  });
  return { casoUso, repositorioUsuarios, repositorioNormas, generadorIds };
}

describe('RegistrarNorma', () => {
  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    'permite que %s registre una norma en BORRADOR',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ rol });
      contexto.repositorioUsuarios.agregar(usuario);

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ usuarioAutenticadoId: usuario.obtenerId() }),
      );

      expect(resultado.exitoso).toBe(true);
      if (resultado.exitoso) {
        expect(resultado.norma.estadoEditorial).toBe(
          EstadoEditorialNorma.BORRADOR,
        );
      }
      expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
    },
  );

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    'devuelve ACCESO_DENEGADO para %s',
    async (rol) => {
      const contexto = crearContexto();
      const usuario = crearUsuario({ rol });
      contexto.repositorioUsuarios.agregar(usuario);

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ usuarioAutenticadoId: usuario.obtenerId() }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    },
  );

  it('devuelve USUARIO_NO_ENCONTRADO si el usuario no existe', async () => {
    const contexto = crearContexto();

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ usuarioAutenticadoId: 'u-inexistente' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'USUARIO_NO_ENCONTRADO',
    });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
  });

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si usuarioAutenticadoId es "%s"',
    async (usuarioAutenticadoId) => {
      const contexto = crearContexto();

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ usuarioAutenticadoId }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si titulo es "%s"',
    async (titulo) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ titulo }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si tipoNorma es "%s"',
    async (tipoNorma) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ tipoNorma }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si institucionExpide es "%s"',
    async (institucionExpide) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ institucionExpide }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it.each(['', '   '])(
    'devuelve SOLICITUD_INVALIDA si fuente es "%s"',
    async (fuente) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ fuente }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    },
  );

  it('devuelve SOLICITUD_INVALIDA si fuente no es una URL válida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ fuente: 'no-es-una-url' }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
  });

  it('devuelve SOLICITUD_INVALIDA si fechaExpedicion es inválida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ fechaExpedicion: new Date('fecha-inválida') }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('devuelve SOLICITUD_INVALIDA si fechaPublicacionOficial es inválida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ fechaPublicacionOficial: new Date('fecha-inválida') }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('devuelve SOLICITUD_INVALIDA si fechaPublicacionOficial es anterior a fechaExpedicion', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({
        fechaExpedicion: new Date('2025-01-10'),
        fechaPublicacionOficial: new Date('2025-01-05'),
      }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
  });

  it('registra estado jurídico VIGENTE si no se informa', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(crearSolicitud());

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.estadoJuridico).toBe(EstadoNorma.VIGENTE);
    }
    expect(contexto.repositorioNormas.guardadas[0].estadoJuridico).toBe(
      EstadoNorma.VIGENTE,
    );
  });

  it.each([EstadoNorma.REFORMADA, EstadoNorma.DEROGADA])(
    'conserva el estado jurídico %s informado',
    async (estadoJuridico) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({ estadoJuridico }),
      );

      expect(resultado.exitoso).toBe(true);
      if (resultado.exitoso) {
        expect(resultado.norma.estadoJuridico).toBe(estadoJuridico);
      }
    },
  );

  it('registra la norma con estadoEditorial BORRADOR y fechaPublicacionEnSistema null', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    await contexto.casoUso.ejecutar(crearSolicitud());

    const guardada = contexto.repositorioNormas.guardadas[0];
    expect(guardada.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
    expect(guardada.fechaPublicacionEnSistema).toBeNull();
  });

  it('permite registrar con contenido vacío', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ contenido: '' }),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(false);
    }
    expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
  });

  it('permite registrar con contenido solo de espacios', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ contenido: '   ' }),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(false);
    }
    expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
  });

  it('omitir contenido lo guarda como cadena vacía', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    await contexto.casoUso.ejecutar(crearSolicitud());

    expect(contexto.repositorioNormas.guardadas[0].contenido).toBe('');
  });

  it('retorna tieneContenidoCompleto true cuando el contenido tiene texto', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ contenido: 'Texto completo de la norma' }),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(true);
    }
  });

  it('usa GeneradorIds para asignar el id de la norma', async () => {
    const contexto = crearContexto('id-determinístico');
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(crearSolicitud());

    expect(contexto.generadorIds.llamadas).toBe(1);
    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.id).toBe('id-determinístico');
    }
    expect(contexto.repositorioNormas.guardadas[0].id).toBe('id-determinístico');
  });

  it('guarda exactamente una norma cuando la solicitud es válida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    await contexto.casoUso.ejecutar(crearSolicitud());

    expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
  });

  it('no guarda nada y no genera id cuando la solicitud falla', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ titulo: '   ' }),
    );

    expect(resultado.exitoso).toBe(false);
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
    expect(contexto.generadorIds.llamadas).toBe(0);
  });
});

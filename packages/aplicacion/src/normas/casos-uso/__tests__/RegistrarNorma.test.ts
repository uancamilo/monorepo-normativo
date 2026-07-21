import { describe, it, expect } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import { RegistrarNorma } from '../RegistrarNorma';
import type { SolicitudRegistrarNorma } from '../RegistrarNorma';
import { GeneradorIds } from '../../puertos/GeneradorIds';
import {
  crearEdicionRegistroOficial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

class GeneradorIdsSecuencial implements GeneradorIds {
  llamadas = 0;
  constructor(private readonly prefijo: string = 'id-generado') {}

  generar(): string {
    this.llamadas += 1;
    return `${this.prefijo}-${this.llamadas}`;
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
    fechaExpedicion: new Date('2025-01-01'),
    ...parcial,
  };
}

interface ContextoCasoUso {
  casoUso: RegistrarNorma;
  repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  repositorioNormas: RepositorioNormasEnMemoriaFake;
  repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  generadorIds: GeneradorIdsSecuencial;
}

function crearContexto(prefijoId = 'id-generado'): ContextoCasoUso {
  const repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
  const repositorioNormas = new RepositorioNormasEnMemoriaFake();
  const repositorioEdiciones =
    new RepositorioEdicionesRegistroOficialEnMemoriaFake();
  const generadorIds = new GeneradorIdsSecuencial(prefijoId);
  const casoUso = new RegistrarNorma({
    repositorioUsuarios,
    repositorioNormas,
    repositorioEdiciones,
    generadorIds,
  });
  return {
    casoUso,
    repositorioUsuarios,
    repositorioNormas,
    repositorioEdiciones,
    generadorIds,
  };
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

  it('la solicitud ya no acepta fuente como dato propio de la norma', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(crearSolicitud());

    expect(resultado.exitoso).toBe(true);
    const guardada = contexto.repositorioNormas.guardadas[0];
    expect('fuente' in guardada).toBe(false);
  });

  it('devuelve SOLICITUD_INVALIDA si fechaExpedicion informada es inválida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ fechaExpedicion: new Date('fecha-inválida') }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('permite registrar sin fechaExpedicion', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ fechaExpedicion: null }),
    );

    expect(resultado.exitoso).toBe(true);
    expect(contexto.repositorioNormas.guardadas[0].fechaExpedicion).toBeNull();
  });

  it('devuelve SOLICITUD_INVALIDA si la triple completa trae fechaPublicacionOficial inválida', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: new Date('fecha-inválida'),
      }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
  });

  it.each<[string, Partial<SolicitudRegistrarNorma>]>([
    [
      'solo tipo',
      { tipoPublicacionRegistroOficial: 'RO' },
    ],
    [
      'solo número',
      { numeroPublicacionRegistroOficial: 500 },
    ],
    [
      'solo fecha',
      { fechaPublicacionOficial: new Date('2025-01-02') },
    ],
    [
      'tipo + número sin fecha',
      {
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
      },
    ],
    [
      'tipo + fecha sin número',
      {
        tipoPublicacionRegistroOficial: 'RO',
        fechaPublicacionOficial: new Date('2025-01-02'),
      },
    ],
    [
      'número + fecha sin tipo',
      {
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: new Date('2025-01-02'),
      },
    ],
  ])(
    'devuelve SOLICITUD_INVALIDA con triple parcial (%s)',
    async (_caso, parcial) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud(parcial),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
      expect(contexto.repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it.each([0, -3, 2.5])(
    'devuelve SOLICITUD_INVALIDA si el número de la triple es %s',
    async (numeroPublicacionRegistroOficial) => {
      const contexto = crearContexto();
      contexto.repositorioUsuarios.agregar(crearUsuario());

      const resultado = await contexto.casoUso.ejecutar(
        crearSolicitud({
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial,
          fechaPublicacionOficial: new Date('2025-01-02'),
        }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(contexto.repositorioNormas.guardadas).toHaveLength(0);
      expect(contexto.repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

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

  it('permite registrar con contenido [] y lo reporta como incompleto', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ contenido: [] }),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.tieneContenidoCompleto).toBe(false);
    }
    expect(contexto.repositorioNormas.guardadas).toHaveLength(1);
  });

  it('omitir contenido lo guarda como []', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    await contexto.casoUso.ejecutar(crearSolicitud());

    expect(contexto.repositorioNormas.guardadas[0].contenido).toEqual([]);
  });

  it('retorna tieneContenidoCompleto true cuando el contenido tiene elementos', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({ contenido: ['Texto completo de la norma'] }),
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
      expect(resultado.norma.id).toBe('id-determinístico-1');
    }
    expect(contexto.repositorioNormas.guardadas[0].id).toBe(
      'id-determinístico-1',
    );
  });

  it('sin la triple de publicación la norma queda sin edición asociada', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(crearSolicitud());

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.edicionesRegistroOficial).toEqual([]);
      expect(resultado.norma).not.toHaveProperty('edicionRegistroOficialId');
    }
    expect(contexto.repositorioEdiciones.guardadas).toHaveLength(0);
  });

  it('con la triple completa crea la EdicionRegistroOficial PENDIENTE y asocia la norma', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2025-01-02'),
      }),
    );

    expect(resultado.exitoso).toBe(true);
    expect(contexto.repositorioEdiciones.guardadas).toHaveLength(1);
    const edicion = contexto.repositorioEdiciones.guardadas[0];
    expect(edicion.tipoPublicacionRegistroOficial).toBe('SRO');
    expect(edicion.numeroPublicacionRegistroOficial).toBe(700);
    expect(edicion.fechaPublicacionOficial.toISOString()).toBe(
      '2025-01-02T00:00:00.000Z',
    );
    expect(edicion.urlPdf).toBeNull();
    expect(edicion.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(contexto.repositorioNormas.guardadas[0].edicionRegistroOficialId).toBe(
      edicion.id,
    );
    if (resultado.exitoso) {
      expect(resultado.norma.edicionesRegistroOficial).toEqual([
        {
          tipoRelacion: 'PRINCIPAL',
          id: edicion.id,
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 700,
          fechaPublicacionOficial: '2025-01-02',
          fuente: null,
        },
      ]);
      expect(resultado.norma).not.toHaveProperty('edicionRegistroOficialId');
    }
  });

  it('normaliza la fecha de la edición cuando aplicación recibe un Date con hora', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 701,
        fechaPublicacionOficial: new Date('2025-01-02T18:30:00.000Z'),
      }),
    );

    expect(resultado.exitoso).toBe(true);
    expect(
      contexto.repositorioEdiciones.guardadas[0].fechaPublicacionOficial.toISOString(),
    ).toBe('2025-01-02T00:00:00.000Z');
  });

  it('reutiliza la edición existente con la misma clave lógica', async () => {
    const contexto = crearContexto();
    contexto.repositorioUsuarios.agregar(crearUsuario());
    contexto.repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-existente',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: new Date('2025-01-02'),
      }),
    );

    const resultado = await contexto.casoUso.ejecutar(
      crearSolicitud({
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: new Date('2025-01-02'),
      }),
    );

    expect(resultado.exitoso).toBe(true);
    // No se crea una edición nueva ni se toca la existente.
    expect(contexto.repositorioEdiciones.guardadas).toHaveLength(0);
    expect(contexto.repositorioNormas.guardadas[0].edicionRegistroOficialId).toBe(
      'edicion-existente',
    );
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

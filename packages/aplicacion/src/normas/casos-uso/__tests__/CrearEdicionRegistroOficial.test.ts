import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { GeneradorIds } from '../../puertos/GeneradorIds';
import { CrearEdicionRegistroOficial } from '../CrearEdicionRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

const URL_PDF =
  'https://www.registroficial.gob.ec/ediciones/registro-oficial-501.pdf';

class GeneradorIdsFake implements GeneradorIds {
  generar(): string {
    return 'edicion-generada';
  }
}

class RepositorioEdicionesQueFalla extends RepositorioEdicionesRegistroOficialEnMemoriaFake {
  async crearORecuperar(): Promise<never> {
    throw new Error('fallo inesperado de infraestructura');
  }
}

describe('CrearEdicionRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let casoUso: CrearEdicionRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    for (const rol of Object.values(RolUsuario)) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    casoUso = new CrearEdicionRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      generadorIds: new GeneradorIdsFake(),
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s crea una edición manual con su URL persistida',
    async (rol) => {
      const resultado = await casoUso.ejecutar(solicitudValida(rol));

      expect(resultado).toEqual({
        exitoso: true,
        edicion: {
          id: 'edicion-generada',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 501,
          fechaPublicacionOficial: new Date('2026-05-03'),
          urlPdf: URL_PDF,
          estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
        },
      });
      const persistida = await repositorioEdiciones.buscarPorId(
        'edicion-generada',
      );
      expect(persistida?.urlPdf).toBe(URL_PDF);
      expect(persistida?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
    },
  );

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede crear ediciones',
    async (rol) => {
      await expect(casoUso.ejecutar(solicitudValida(rol))).resolves.toEqual({
        exitoso: false,
        razon: 'ACCESO_DENEGADO',
      });
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it('rechaza una URL inválida sin persistir la edición', async () => {
    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      urlPdf: 'no-es-url',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'URL_INVALIDA' });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });

  it('acepta una URL válida con espacios exteriores y persiste su valor normalizado', async () => {
    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      urlPdf: `  ${URL_PDF}  `,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.edicion.urlPdf).toBe(URL_PDF);
    }
    expect(repositorioEdiciones.guardadas[0]?.urlPdf).toBe(URL_PDF);
  });

  it.each([0, -5, 3.5])(
    'rechaza número %s como SOLICITUD_INVALIDA, no como URL_INVALIDA',
    async (numeroPublicacionRegistroOficial) => {
      const resultado = await casoUso.ejecutar({
        ...solicitudValida(RolUsuario.EDITOR),
        numeroPublicacionRegistroOficial,
      });

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'SOLICITUD_INVALIDA',
      });
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it('propaga un error inesperado del repositorio sin ocultarlo', async () => {
    const repositorioQueFalla = new RepositorioEdicionesQueFalla();
    const casoUsoConFallo = new CrearEdicionRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones: repositorioQueFalla,
      generadorIds: new GeneradorIdsFake(),
    });

    await expect(
      casoUsoConFallo.ejecutar(solicitudValida(RolUsuario.EDITOR)),
    ).rejects.toThrow('fallo inesperado de infraestructura');
  });

  it('normaliza la fecha recibida por aplicación al día calendario UTC', async () => {
    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      fechaPublicacionOficial: new Date('2026-05-03T18:45:12.123Z'),
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.edicion.fechaPublicacionOficial.toISOString()).toBe(
        '2026-05-03T00:00:00.000Z',
      );
    }
  });

  it('rechaza una fecha inválida como SOLICITUD_INVALIDA', async () => {
    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      fechaPublicacionOficial: new Date('fecha-inválida'),
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'SOLICITUD_INVALIDA',
    });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });

  it('rechaza la edición de triple duplicada sin sobrescribir URL ni estado', async () => {
    const existente = crearEdicionRegistroOficial({
      id: 'edicion-existente',
      numeroPublicacionRegistroOficial: 501,
      fechaPublicacionOficial: new Date('2026-05-03'),
      urlPdf: 'https://www.registroficial.gob.ec/ediciones/existente.pdf',
      estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
    });
    repositorioEdiciones.agregar(existente);

    const resultado = await casoUso.ejecutar(solicitudValida(RolUsuario.EDITOR));

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_YA_EXISTE',
    });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
    const conservada = await repositorioEdiciones.buscarPorId(
      'edicion-existente',
    );
    expect(conservada?.urlPdf).toBe(
      'https://www.registroficial.gob.ec/ediciones/existente.pdf',
    );
    expect(conservada?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
  });

  it('reconoce como duplicada la misma triple aunque el Date directo tenga hora', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-existente-mismo-dia',
        numeroPublicacionRegistroOficial: 501,
        fechaPublicacionOficial: new Date('2026-05-03T00:00:00.000Z'),
        urlPdf: 'https://www.registroficial.gob.ec/ediciones/existente-dia.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
      }),
    );

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      fechaPublicacionOficial: new Date('2026-05-03T23:59:59.999Z'),
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_YA_EXISTE',
    });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });

  it.each([
    ['usuario', { usuarioAutenticadoId: ' ' }],
    ['tipo', { tipoPublicacionRegistroOficial: '' }],
    ['número', { numeroPublicacionRegistroOficial: undefined }],
    ['fecha', { fechaPublicacionOficial: undefined }],
    ['URL', { urlPdf: '' }],
  ])('rechaza la solicitud cuando falta %s', async (_campo, cambio) => {
    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      ...cambio,
    } as never);

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });
});

function solicitudValida(rol: RolUsuario) {
  return {
    usuarioAutenticadoId: `usuario-${rol}`,
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 501,
    fechaPublicacionOficial: new Date('2026-05-03'),
    urlPdf: URL_PDF,
  };
}

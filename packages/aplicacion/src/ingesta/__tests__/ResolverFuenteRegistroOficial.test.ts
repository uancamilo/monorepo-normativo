import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ResolverFuenteRegistroOficial } from '../casos-uso/ResolverFuenteRegistroOficial';
import {
  CatalogoRegistroOficialFake,
  crearUsuarioConRol,
  RepositorioUsuariosFake,
} from './apoyo/fakes-ingesta';
import {
  crearEdicionRegistroOficial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
} from '../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';

const URL_PDF = 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf';

describe('ResolverFuenteRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let catalogo: CatalogoRegistroOficialFake;
  let casoUso: ResolverFuenteRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    catalogo = new CatalogoRegistroOficialFake();
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioConRol(rol));
    }
    casoUso = new ResolverFuenteRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      catalogoRegistroOficial: catalogo,
    });
  });

  function agregarEdicionPendiente(id = 'edicion-1', numero = 500) {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id,
        numeroPublicacionRegistroOficial: numero,
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
  }

  it('coincidencia única y confiable deja la edición RESUELTA con urlPdf', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: new Date('2026-05-02') }],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado).toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-1',
          procesada: true,
          estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
          urlPdf: URL_PDF,
        },
      ],
    });
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.urlPdf).toBe(URL_PDF);
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
  });

  it('sin catálogo configurado devuelve CATALOGO_NO_DISPONIBLE sin modificar ediciones', async () => {
    agregarEdicionPendiente();
    const casoUsoSinCatalogo = new ResolverFuenteRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
    });

    const resultado = await casoUsoSinCatalogo.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_NO_DISPONIBLE',
    });
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(edicion?.urlPdf).toBeNull();
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });

  it('coincidencia única sin fecha en el catálogo también resuelve', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
  });

  it('cero coincidencias deja NO_ENCONTRADA con urlPdf null', async () => {
    agregarEdicionPendiente();

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado).toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-1',
          procesada: true,
          estadoResolucionFuente: EstadoResolucionFuente.NO_ENCONTRADA,
          urlPdf: null,
        },
      ],
    });
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.urlPdf).toBeNull();
  });

  it('múltiples URLs posibles sin desempate por fecha dejan CONFLICTIVA con urlPdf null', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [
        { urlPdf: `${URL_PDF}?v=1`, fechaPublicacionOficial: null },
        { urlPdf: `${URL_PDF}?v=2`, fechaPublicacionOficial: null },
      ],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.resultados[0]).toEqual({
      edicionId: 'edicion-1',
      procesada: true,
      estadoResolucionFuente: EstadoResolucionFuente.CONFLICTIVA,
      urlPdf: null,
    });
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.urlPdf).toBeNull();
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.CONFLICTIVA,
    );
  });

  it('entre múltiples coincidencias, la fecha detectada desempata si es única', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [
        {
          urlPdf: `${URL_PDF}?v=1`,
          fechaPublicacionOficial: new Date('2026-01-15'),
        },
        {
          urlPdf: `${URL_PDF}?v=2`,
          fechaPublicacionOficial: new Date('2026-05-02'),
        },
      ],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
    expect(edicion?.urlPdf).toBe(`${URL_PDF}?v=2`);
  });

  it('una fecha discrepante en la coincidencia única marca CONFLICTIVA y no sobrescribe la fecha detectada', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: new Date('2026-06-30') }],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.CONFLICTIVA,
    );
    expect(edicion?.urlPdf).toBeNull();
    expect(edicion?.fechaPublicacionOficial).toEqual(new Date('2026-05-02'));
  });

  it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
    'no sobrescribe una edición %s (FUENTE_YA_ESTABLECIDA)',
    async (estadoResolucionFuente) => {
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({ estadoResolucionFuente }),
      );
      catalogo.registrar(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
        [{ urlPdf: 'https://otra.url/pdf', fechaPublicacionOficial: null }],
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        edicionIds: ['edicion-1'],
      });

      expect(resultado).toEqual({
        exitoso: true,
        resultados: [
          {
            edicionId: 'edicion-1',
            procesada: false,
            razon: 'FUENTE_YA_ESTABLECIDA',
          },
        ],
      });
      const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
      expect(edicion?.urlPdf).toBe(URL_PDF);
    },
  );

  it('es idempotente: una segunda ejecución no cambia una edición ya RESUELTA', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
    );

    await casoUso.ejecutar({ usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR' });
    const segunda = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    // La edición ya no está PENDIENTE, así que la pasada sin ids no la toca.
    expect(segunda).toEqual({ exitoso: true, resultados: [] });
    expect(repositorioEdiciones.guardadas).toHaveLength(1);
  });

  it('no reintenta por id una edición NO_ENCONTRADA porque solo PENDIENTE puede actualizarse', async () => {
    agregarEdicionPendiente();
    await casoUso.ejecutar({ usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR' });
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['edicion-1'],
    });

    expect(resultado).toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-1',
          procesada: false,
          razon: 'FUENTE_YA_ESTABLECIDA',
        },
      ],
    });
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.NO_ENCONTRADA,
    );
  });

  it('omite una resolución obsoleta si una corrección MANUAL gana durante la consulta al catálogo', async () => {
    agregarEdicionPendiente();
    let notificarConsulta!: () => void;
    let liberarConsulta!: () => void;
    const consultaIniciada = new Promise<void>((resolve) => {
      notificarConsulta = resolve;
    });
    const continuarConsulta = new Promise<void>((resolve) => {
      liberarConsulta = resolve;
    });
    catalogo.buscarEdiciones = async () => {
      notificarConsulta();
      await continuarConsulta;
      return [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }];
    };

    const resolucion = casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['edicion-1'],
    });
    await consultaIniciada;
    const pendiente = await repositorioEdiciones.buscarPorId('edicion-1');
    const urlManual = 'https://www.registroficial.gob.ec/ediciones/manual.pdf';
    await repositorioEdiciones.guardar(
      pendiente!.corregirFuenteManualmente(urlManual),
    );
    liberarConsulta();

    await expect(resolucion).resolves.toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-1',
          procesada: false,
          razon: 'FUENTE_YA_ESTABLECIDA',
        },
      ],
    });
    const persistida = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(persistida?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.MANUAL,
    );
    expect(persistida?.urlPdf).toBe(urlManual);
  });

  it('omite una resolución obsoleta si otra resolución RESUELTA gana la carrera', async () => {
    agregarEdicionPendiente();
    let notificarConsulta!: () => void;
    let liberarConsulta!: () => void;
    const consultaIniciada = new Promise<void>((resolve) => {
      notificarConsulta = resolve;
    });
    const continuarConsulta = new Promise<void>((resolve) => {
      liberarConsulta = resolve;
    });
    catalogo.buscarEdiciones = async () => {
      notificarConsulta();
      await continuarConsulta;
      return [{ urlPdf: `${URL_PDF}?perdedora`, fechaPublicacionOficial: null }];
    };

    const resolucion = casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['edicion-1'],
    });
    await consultaIniciada;
    const pendiente = await repositorioEdiciones.buscarPorId('edicion-1');
    const urlGanadora = `${URL_PDF}?ganadora`;
    await repositorioEdiciones.guardar(pendiente!.resolverFuente(urlGanadora));
    liberarConsulta();

    await expect(resolucion).resolves.toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-1',
          procesada: false,
          razon: 'FUENTE_YA_ESTABLECIDA',
        },
      ],
    });
    const persistida = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(persistida?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
    expect(persistida?.urlPdf).toBe(urlGanadora);
  });

  it('una edición inexistente se reporta EDICION_NO_ENCONTRADA', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['edicion-fantasma'],
    });

    expect(resultado).toEqual({
      exitoso: true,
      resultados: [
        {
          edicionId: 'edicion-fantasma',
          procesada: false,
          razon: 'EDICION_NO_ENCONTRADA',
        },
      ],
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede resolver fuentes (ACCESO_DENEGADO)',
    async (rol) => {
      agregarEdicionPendiente();

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it('usuario inexistente devuelve ACCESO_DENEGADO', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
  });

  it.each([
    ['usuario vacío', { usuarioAutenticadoId: '  ' }],
    [
      'lista de ediciones vacía',
      { usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR', edicionIds: [] },
    ],
    [
      'id de edición vacío',
      {
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        edicionIds: ['edicion-1', '  '],
      },
    ],
  ])('devuelve SOLICITUD_INVALIDA con %s', async (_nombre, solicitud) => {
    const resultado = await casoUso.ejecutar(solicitud);

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });
});

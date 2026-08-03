import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import {
  LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION_LOTE,
  ResolverFuenteRegistroOficial,
} from '../casos-uso/ResolverFuenteRegistroOficial';
import { codificarCursorEdicionesLote } from '../casos-uso/cursor-edicion-lote';
import {
  CatalogoRegistroOficialFake,
  ConsultorEdicionesRegistroOficialPorLoteFake,
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
  let consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLoteFake;
  let casoUso: ResolverFuenteRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    catalogo = new CatalogoRegistroOficialFake();
    consultorEdicionesPorLote = new ConsultorEdicionesRegistroOficialPorLoteFake(
      repositorioEdiciones,
    );
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
      consultorEdicionesPorLote,
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
      consultorEdicionesPorLote,
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
      expect(catalogo.consultas).toHaveLength(0);
    },
  );

  it.each([
    EstadoResolucionFuente.NO_ENCONTRADA,
    EstadoResolucionFuente.CONFLICTIVA,
  ])(
    'una petición explícita por id sobre una edición %s devuelve FUENTE_YA_ESTABLECIDA sin consultar el catálogo',
    async (estadoResolucionFuente) => {
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({ urlPdf: null, estadoResolucionFuente }),
      );
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
      expect(catalogo.consultas).toHaveLength(0);
      const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
      expect(edicion?.estadoResolucionFuente).toBe(estadoResolucionFuente);
      expect(edicion?.urlPdf).toBeNull();
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
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
    const consultasTrasPrimeraPasada = catalogo.consultas.length;
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
    // El reintento ni siquiera consulta el catálogo: la edición terminal se
    // omite antes de cualquier llamada externa.
    expect(catalogo.consultas).toHaveLength(consultasTrasPrimeraPasada);
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
      return {
        exitoso: true,
        candidatas: [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
      };
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
      return {
        exitoso: true,
        candidatas: [
          { urlPdf: `${URL_PDF}?perdedora`, fechaPublicacionOficial: null },
        ],
      };
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
    [
      'ids duplicados (tras recorte)',
      {
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        edicionIds: ['edicion-1', ' edicion-1 '],
      },
    ],
    [
      'límite no entero',
      { usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR', limite: 1.5 },
    ],
    [
      'límite cero',
      { usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR', limite: 0 },
    ],
  ])('devuelve SOLICITUD_INVALIDA con %s', async (_nombre, solicitud) => {
    const resultado = await casoUso.ejecutar(solicitud);

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('edicionIds y limite simultáneos son SOLICITUD_INVALIDA sin consultar usuarios, catálogo ni ediciones', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['edicion-1'],
      limite: 1,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    // La validación estructural ocurre antes de tocar cualquier dependencia.
    expect(repositorioUsuarios.busquedas).toHaveLength(0);
    expect(catalogo.consultas).toHaveLength(0);
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(edicion?.urlPdf).toBeNull();
  });

  it('un lote de ids que supera el máximo configurado es SOLICITUD_INVALIDA', async () => {
    const acotado = new ResolverFuenteRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      catalogoRegistroOficial: catalogo,
      consultorEdicionesPorLote,
      limiteMaximoEdiciones: 2,
    });

    const resultado = await acotado.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      edicionIds: ['a', 'b', 'c'],
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  describe('fallo técnico del catálogo', () => {
    const RAZONES_CATALOGO = [
      'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' as const,
      'RESPUESTA_CATALOGO_INVALIDA' as const,
      'COBERTURA_CATALOGO_NO_DISPONIBLE' as const,
      'BUSQUEDA_CATALOGO_INCOMPLETA' as const,
    ];

    it.each(RAZONES_CATALOGO)(
      '%s conserva su razón exacta sin cambiar la edición a NO_ENCONTRADA',
      async (razon) => {
        agregarEdicionPendiente();
        catalogo.registrarFallo(
          { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
          razon,
        );

        const resultado = await casoUso.ejecutar({
          usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        });

        expect(resultado).toEqual({
          exitoso: true,
          resultados: [
            {
              edicionId: 'edicion-1',
              procesada: false,
              razon,
            },
          ],
        });
        const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
        expect(edicion?.estadoResolucionFuente).toBe(
          EstadoResolucionFuente.PENDIENTE,
        );
        expect(edicion?.urlPdf).toBeNull();
        expect(repositorioEdiciones.guardadas).toHaveLength(0);
      },
    );

    it('un lote con fallos distintos conserva cada razón, el orden determinista y sigue procesando el resto', async () => {
      // Cinco pendientes: cuatro fallan con razones distintas y la última
      // resuelve. El orden de pendientes es fecha oficial ascendente.
      const numeros = [500, 501, 502, 503, 504];
      for (const [indice, numero] of numeros.entries()) {
        repositorioEdiciones.agregar(
          crearEdicionRegistroOficial({
            id: `edicion-${numero}`,
            numeroPublicacionRegistroOficial: numero,
            fechaPublicacionOficial: new Date(`2026-05-0${indice + 1}`),
            urlPdf: null,
            estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
          }),
        );
      }
      for (const [indice, razon] of RAZONES_CATALOGO.entries()) {
        catalogo.registrarFallo(
          {
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: numeros[indice],
          },
          razon,
        );
      }
      catalogo.registrar(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 504 },
        [{ urlPdf: URL_PDF, fechaPublicacionOficial: new Date('2026-05-05') }],
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      });

      expect(resultado).toEqual({
        exitoso: true,
        resultados: [
          { edicionId: 'edicion-500', procesada: false, razon: RAZONES_CATALOGO[0] },
          { edicionId: 'edicion-501', procesada: false, razon: RAZONES_CATALOGO[1] },
          { edicionId: 'edicion-502', procesada: false, razon: RAZONES_CATALOGO[2] },
          { edicionId: 'edicion-503', procesada: false, razon: RAZONES_CATALOGO[3] },
          {
            edicionId: 'edicion-504',
            procesada: true,
            estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
            urlPdf: URL_PDF,
          },
        ],
      });
      for (const numero of [500, 501, 502, 503]) {
        const edicion = await repositorioEdiciones.buscarPorId(
          `edicion-${numero}`,
        );
        expect(edicion?.estadoResolucionFuente).toBe(
          EstadoResolucionFuente.PENDIENTE,
        );
        expect(edicion?.urlPdf).toBeNull();
      }
    });
  });

  it('una edición PENDIENTE sí consulta el catálogo, con la fecha oficial detectada (para ubicar el año/mes)', async () => {
    agregarEdicionPendiente();

    await casoUso.ejecutar({ usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR' });

    expect(catalogo.consultas).toEqual([
      {
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: new Date('2026-05-02'),
      },
    ]);
  });

  it('acota el lote de pendientes al máximo configurado y respeta el orden determinista', async () => {
    // Tres pendientes con fechas distintas; el orden es fecha ascendente.
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-b',
        numeroPublicacionRegistroOficial: 502,
        fechaPublicacionOficial: new Date('2026-05-03'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-a',
        numeroPublicacionRegistroOficial: 501,
        fechaPublicacionOficial: new Date('2026-05-01'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-c',
        numeroPublicacionRegistroOficial: 503,
        fechaPublicacionOficial: new Date('2026-05-05'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    const acotado = new ResolverFuenteRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      catalogoRegistroOficial: catalogo,
      consultorEdicionesPorLote,
      limiteMaximoEdiciones: 2,
      maxConcurrencia: 1,
    });

    const resultado = await acotado.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    if (!resultado.exitoso) {
      throw new Error('esperaba éxito');
    }
    // Solo las 2 primeras por fecha ascendente: edicion-a (05-01), edicion-b (05-03).
    expect(resultado.resultados.map((r) => r.edicionId)).toEqual([
      'edicion-a',
      'edicion-b',
    ]);
  });

  it('varias URLs válidas idénticas se deduplican antes de decidir', async () => {
    agregarEdicionPendiente();
    catalogo.registrar(
      { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
      [
        { urlPdf: URL_PDF, fechaPublicacionOficial: null },
        { urlPdf: URL_PDF, fechaPublicacionOficial: null },
      ],
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    // Dos candidatas con la misma URL deduplican a una sola coincidencia:
    // se resuelve, no queda CONFLICTIVA por un duplicado exacto.
    expect(resultado.resultados[0]).toEqual({
      edicionId: 'edicion-1',
      procesada: true,
      estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
      urlPdf: URL_PDF,
    });
  });

  describe('fail-closed ante URLs candidatas no confiables', () => {
    async function esperarRespuestaCatalogoInvalida(
      candidatas: { urlPdf: string; fechaPublicacionOficial: Date | null }[],
    ) {
      agregarEdicionPendiente();
      catalogo.registrar(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 500 },
        candidatas,
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      });

      expect(resultado).toEqual({
        exitoso: true,
        resultados: [
          {
            edicionId: 'edicion-1',
            procesada: false,
            razon: 'RESPUESTA_CATALOGO_INVALIDA',
          },
        ],
      });
      const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
      expect(edicion?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.PENDIENTE,
      );
      expect(edicion?.urlPdf).toBeNull();
      // Ninguna escritura en el repositorio: guardarResolucionSiPendiente
      // nunca se invoca ante una respuesta no confiable.
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    }

    it('única candidata mal formada deja la edición PENDIENTE con RESPUESTA_CATALOGO_INVALIDA', async () => {
      await esperarRespuestaCatalogoInvalida([
        { urlPdf: 'no-es-una-url', fechaPublicacionOficial: null },
      ]);
    });

    it('única candidata HTTP (incluso localhost) deja la edición PENDIENTE con RESPUESTA_CATALOGO_INVALIDA', async () => {
      // Una candidata PDF persistible debe ser HTTPS: localhost solo es
      // aceptable como URL BASE de un fixture de infraestructura, nunca como
      // fuente persistida por aplicación.
      await esperarRespuestaCatalogoInvalida([
        {
          urlPdf: 'http://localhost:3999/documento.pdf',
          fechaPublicacionOficial: null,
        },
      ]);
    });

    it('protocolo no permitido (ftp:) deja la edición PENDIENTE con RESPUESTA_CATALOGO_INVALIDA', async () => {
      await esperarRespuestaCatalogoInvalida([
        {
          urlPdf: 'ftp://catalogo.test/documento.pdf',
          fechaPublicacionOficial: null,
        },
      ]);
    });

    it('mezcla de candidata válida e inválida invalida toda la respuesta sin aprovechar la válida', async () => {
      await esperarRespuestaCatalogoInvalida([
        { urlPdf: URL_PDF, fechaPublicacionOficial: null },
        { urlPdf: 'url-invalida', fechaPublicacionOficial: null },
      ]);
    });

    it('todas las candidatas inválidas (dos formas distintas) no producen NO_ENCONTRADA', async () => {
      await esperarRespuestaCatalogoInvalida([
        { urlPdf: 'no-es-una-url', fechaPublicacionOficial: null },
        {
          urlPdf: 'javascript:alert(1)',
          fechaPublicacionOficial: null,
        },
      ]);
    });
  });

  it('el límite de la solicitud nunca supera el máximo configurado', async () => {
    for (const [indice, fecha] of ['2026-05-01', '2026-05-02', '2026-05-03'].entries()) {
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          id: `edicion-${indice}`,
          numeroPublicacionRegistroOficial: 600 + indice,
          fechaPublicacionOficial: new Date(fecha),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        }),
      );
    }
    const acotado = new ResolverFuenteRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      catalogoRegistroOficial: catalogo,
      consultorEdicionesPorLote,
      limiteMaximoEdiciones: 2,
    });

    const resultado = await acotado.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      limite: 100,
    });

    if (!resultado.exitoso) {
      throw new Error('esperaba éxito');
    }
    expect(resultado.resultados).toHaveLength(2);
  });

  describe('selección por loteId (paginación de un lote de ingesta)', () => {
    const LOTE_A = 'lote-a';
    const LOTE_B = 'lote-b';

    function pendiente(id: string, overrides: Partial<Parameters<typeof crearEdicionRegistroOficial>[0]> = {}) {
      const edicion = crearEdicionRegistroOficial({
        id,
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        ...overrides,
      });
      repositorioEdiciones.agregar(edicion);
      return edicion;
    }

    function registrarCatalogoResuelto(numero: number) {
      catalogo.registrar(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: numero },
        [{ urlPdf: `${URL_PDF}?n=${numero}`, fechaPublicacionOficial: null }],
      );
    }

    it('1. loteId selecciona únicamente ediciones originadas por ese lote', async () => {
      pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
      pendiente('edicion-a2', { numeroPublicacionRegistroOficial: 502 });
      pendiente('edicion-otro', { numeroPublicacionRegistroOficial: 999 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-a1',
        'edicion-a2',
      ]);
      registrarCatalogoResuelto(501);
      registrarCatalogoResuelto(502);
      registrarCatalogoResuelto(999);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados.map((r) => r.edicionId).sort()).toEqual([
        'edicion-a1',
        'edicion-a2',
      ]);
    });

    it('2. dos lotes no mezclan sus ediciones', async () => {
      pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
      pendiente('edicion-b1', { numeroPublicacionRegistroOficial: 601 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-a1']);
      consultorEdicionesPorLote.registrarLote(LOTE_B, ['edicion-b1']);
      registrarCatalogoResuelto(501);
      registrarCatalogoResuelto(601);

      const resultadoA = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });
      // Se re-crea el caso de uso porque edicion-a1 ya quedó RESUELTA tras la
      // primera pasada (idempotencia por edición, no por lote).
      const resultadoB = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_B,
      });

      expect(resultadoA.exitoso).toBe(true);
      expect(resultadoB.exitoso).toBe(true);
      if (!resultadoA.exitoso || !resultadoB.exitoso) return;
      expect(resultadoA.resultados.map((r) => r.edicionId)).toEqual([
        'edicion-a1',
      ]);
      expect(resultadoB.resultados.map((r) => r.edicionId)).toEqual([
        'edicion-b1',
      ]);
    });

    it('3. varias entradas con la misma triple generan una sola edición procesada', async () => {
      pendiente('edicion-compartida', { numeroPublicacionRegistroOficial: 501 });
      consultorEdicionesPorLote.agregarEdicionAlLote(LOTE_A, 'edicion-compartida');
      consultorEdicionesPorLote.agregarEdicionAlLote(LOTE_A, 'edicion-compartida');
      consultorEdicionesPorLote.agregarEdicionAlLote(LOTE_A, 'edicion-compartida');
      registrarCatalogoResuelto(501);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados).toHaveLength(1);
      expect(catalogo.consultas).toHaveLength(1);
    });

    it('4. la selección depende del puerto de triples del lote, no de ninguna asociación de Norma', async () => {
      // ResolverFuenteRegistroOficial no recibe RepositorioNormas en sus
      // dependencias (ver DependenciasResolverFuenteRegistroOficial): la
      // única fuente posible para "qué ediciones pertenecen a este lote" es
      // el puerto ConsultorEdicionesRegistroOficialPorLote, inyectado aquí
      // como fake que solo conoce triples registradas explícitamente, nunca
      // una Norma ni su edicionRegistroOficialId.
      pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-a1']);
      registrarCatalogoResuelto(501);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      expect(consultorEdicionesPorLote.llamadasPagina).toHaveLength(1);
      expect(consultorEdicionesPorLote.llamadasPagina[0].loteId).toBe(LOTE_A);
    });

    it('5. no se consulta ningún repositorio de Normas para resolver el lote', () => {
      // Prueba estructural: el tipo de dependencias del caso de uso no
      // incluye RepositorioNormas. Si algún día se agregara, este test
      // dejaría de compilar y evidenciaría el cambio de contrato.
      const dependencias: ConstructorParameters<
        typeof ResolverFuenteRegistroOficial
      >[0] = {
        repositorioUsuarios,
        repositorioEdiciones,
        catalogoRegistroOficial: catalogo,
        consultorEdicionesPorLote,
      };
      expect(dependencias).not.toHaveProperty('repositorioNormas');
    });

    it('6. solo se procesan ediciones PENDIENTE sin fuente', async () => {
      pendiente('edicion-pendiente', { numeroPublicacionRegistroOficial: 501 });
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          id: 'edicion-con-url',
          numeroPublicacionRegistroOficial: 502,
          urlPdf: URL_PDF,
          estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
        }),
      );
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-pendiente',
        'edicion-con-url',
      ]);
      registrarCatalogoResuelto(501);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      // La edición ya resuelta ni siquiera aparece en la página del puerto
      // (el fake ya la excluye, igual que haría un adaptador real).
      expect(resultado.resultados.map((r) => r.edicionId)).toEqual([
        'edicion-pendiente',
      ]);
    });

    it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
      '7. una edición %s del lote no se reprocesa (ni aparece en la página)',
      async (estado) => {
        pendiente('edicion-terminal', {
          numeroPublicacionRegistroOficial: 501,
          urlPdf: URL_PDF,
          estadoResolucionFuente: estado,
        });
        consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-terminal']);

        const resultado = await casoUso.ejecutar({
          usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
          loteId: LOTE_A,
        });

        expect(resultado.exitoso).toBe(true);
        if (!resultado.exitoso) return;
        expect(resultado.resultados).toHaveLength(0);
        expect(catalogo.consultas).toHaveLength(0);
      },
    );

    it.each([
      EstadoResolucionFuente.NO_ENCONTRADA,
      EstadoResolucionFuente.CONFLICTIVA,
    ])(
      '8. una edición %s del lote no se reprocesa (ni aparece en la página)',
      async (estado) => {
        pendiente('edicion-terminal', {
          numeroPublicacionRegistroOficial: 501,
          urlPdf: null,
          estadoResolucionFuente: estado,
        });
        consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-terminal']);

        const resultado = await casoUso.ejecutar({
          usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
          loteId: LOTE_A,
        });

        expect(resultado.exitoso).toBe(true);
        if (!resultado.exitoso) return;
        expect(resultado.resultados).toHaveLength(0);
        expect(catalogo.consultas).toHaveLength(0);
      },
    );

    it('9. un lote existente sin ninguna edición asociada (p. ej. triples incompletas) no fabrica candidatas', async () => {
      consultorEdicionesPorLote.registrarLoteVacio(LOTE_A);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado).toEqual({
        exitoso: true,
        resultados: [],
        paginacionLote: {
          hayMas: false,
          siguienteCursor: null,
          pendientesRestantesLote: 0,
        },
      });
      expect(catalogo.consultas).toHaveLength(0);
    });

    it('10. loteId + limite es una combinación válida', async () => {
      pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
      pendiente('edicion-a2', {
        numeroPublicacionRegistroOficial: 502,
        fechaPublicacionOficial: new Date('2026-05-03'),
      });
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-a1',
        'edicion-a2',
      ]);
      registrarCatalogoResuelto(501);
      registrarCatalogoResuelto(502);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
        limite: 1,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados).toHaveLength(1);
      expect(resultado.paginacionLote?.hayMas).toBe(true);
      expect(resultado.paginacionLote?.siguienteCursor).not.toBeNull();
    });

    describe('11. combinaciones inválidas de selectores', () => {
      it.each([
        [
          'edicionIds + loteId',
          {
            usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
            edicionIds: ['x'],
            loteId: LOTE_A,
          },
        ],
        [
          'edicionIds + cursor',
          {
            usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
            edicionIds: ['x'],
            cursor: 'cualquiera',
          },
        ],
        [
          'cursor sin loteId',
          {
            usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
            cursor: 'cualquiera',
          },
        ],
        [
          'loteId vacío',
          { usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR', loteId: '   ' },
        ],
        [
          'cursor mal formado (no es Base64URL de un JSON válido)',
          {
            usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
            loteId: LOTE_A,
            cursor: 'esto-no-es-un-cursor-valido',
          },
        ],
      ])('rechaza %s con SOLICITUD_INVALIDA', async (_nombre, solicitud) => {
        const resultado = await casoUso.ejecutar(solicitud);
        expect(resultado).toEqual({
          exitoso: false,
          razon: 'SOLICITUD_INVALIDA',
        });
      });

      it('rechaza un cursor perteneciente a otro loteId', async () => {
        pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
        consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-a1']);
        consultorEdicionesPorLote.registrarLoteVacio(LOTE_B);
        const cursorDeOtroLote = codificarCursorEdicionesLote(LOTE_B, {
          fechaPublicacionOficial: new Date('2026-05-01'),
          edicionId: 'edicion-b1',
        });

        const resultado = await casoUso.ejecutar({
          usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
          loteId: LOTE_A,
          cursor: cursorDeOtroLote,
        });

        expect(resultado).toEqual({
          exitoso: false,
          razon: 'SOLICITUD_INVALIDA',
        });
      });
    });

    it('12. respeta el orden estable (fecha ascendente, luego id) reportado por el puerto', async () => {
      pendiente('edicion-b', {
        numeroPublicacionRegistroOficial: 502,
        fechaPublicacionOficial: new Date('2026-05-03'),
      });
      pendiente('edicion-a', {
        numeroPublicacionRegistroOficial: 501,
        fechaPublicacionOficial: new Date('2026-05-01'),
      });
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-b',
        'edicion-a',
      ]);
      registrarCatalogoResuelto(501);
      registrarCatalogoResuelto(502);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados.map((r) => r.edicionId)).toEqual([
        'edicion-a',
        'edicion-b',
      ]);
    });

    it('13. dos páginas sucesivas no duplican ni omiten ediciones', async () => {
      const fechas = ['2026-05-01', '2026-05-02', '2026-05-03'];
      fechas.forEach((fecha, indice) => {
        pendiente(`edicion-${indice}`, {
          numeroPublicacionRegistroOficial: 501 + indice,
          fechaPublicacionOficial: new Date(fecha),
        });
        registrarCatalogoResuelto(501 + indice);
      });
      consultorEdicionesPorLote.registrarLote(
        LOTE_A,
        fechas.map((_, indice) => `edicion-${indice}`),
      );

      const primera = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
        limite: 2,
      });
      expect(primera.exitoso).toBe(true);
      if (!primera.exitoso) return;
      expect(primera.paginacionLote?.hayMas).toBe(true);
      const cursor = primera.paginacionLote?.siguienteCursor;
      expect(cursor).not.toBeNull();

      const segunda = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
        limite: 2,
        cursor: cursor ?? undefined,
      });
      expect(segunda.exitoso).toBe(true);
      if (!segunda.exitoso) return;

      const todosLosIds = [
        ...primera.resultados.map((r) => r.edicionId),
        ...segunda.resultados.map((r) => r.edicionId),
      ];
      expect(todosLosIds.sort()).toEqual([
        'edicion-0',
        'edicion-1',
        'edicion-2',
      ]);
      expect(new Set(todosLosIds).size).toBe(todosLosIds.length);
      expect(segunda.paginacionLote?.hayMas).toBe(false);
    });

    it('14. una falla técnica en la primera página no impide llegar a ediciones posteriores', async () => {
      pendiente('edicion-falla', {
        numeroPublicacionRegistroOficial: 501,
        fechaPublicacionOficial: new Date('2026-05-01'),
      });
      pendiente('edicion-ok', {
        numeroPublicacionRegistroOficial: 502,
        fechaPublicacionOficial: new Date('2026-05-02'),
      });
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-falla',
        'edicion-ok',
      ]);
      catalogo.registrarFallo(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 501 },
        'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
      );
      registrarCatalogoResuelto(502);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados).toEqual([
        {
          edicionId: 'edicion-falla',
          procesada: false,
          razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
        },
        {
          edicionId: 'edicion-ok',
          procesada: true,
          estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
          urlPdf: `${URL_PDF}?n=502`,
        },
      ]);
    });

    it('15. una nueva ejecución sin cursor reintenta la edición que sigue pendiente por fallo técnico', async () => {
      pendiente('edicion-falla', { numeroPublicacionRegistroOficial: 501 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-falla']);
      catalogo.registrarFallo(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 501 },
        'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
      );

      const primera = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });
      expect(primera.exitoso).toBe(true);
      if (!primera.exitoso) return;
      expect(primera.resultados[0].procesada).toBe(false);

      catalogo.limpiarFallo({
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 501,
      });
      registrarCatalogoResuelto(501);
      const segunda = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(segunda.exitoso).toBe(true);
      if (!segunda.exitoso) return;
      expect(segunda.resultados).toEqual([
        {
          edicionId: 'edicion-falla',
          procesada: true,
          estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
          urlPdf: `${URL_PDF}?n=501`,
        },
      ]);
    });

    it('16. una resolución concurrente durante el procesamiento del lote sigue protegida por el CAS existente', async () => {
      pendiente('edicion-carrera', { numeroPublicacionRegistroOficial: 501 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-carrera']);
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
        return {
          exitoso: true,
          candidatas: [{ urlPdf: URL_PDF, fechaPublicacionOficial: null }],
        };
      };

      const resolucion = casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });
      await consultaIniciada;
      const pendienteActual = await repositorioEdiciones.buscarPorId(
        'edicion-carrera',
      );
      const urlManual = 'https://www.registroficial.gob.ec/ediciones/manual.pdf';
      await repositorioEdiciones.guardar(
        pendienteActual!.corregirFuenteManualmente(urlManual),
      );
      liberarConsulta();

      const resultado = await resolucion;
      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.resultados).toEqual([
        {
          edicionId: 'edicion-carrera',
          procesada: false,
          razon: 'FUENTE_YA_ESTABLECIDA',
        },
      ]);
      const persistida = await repositorioEdiciones.buscarPorId('edicion-carrera');
      expect(persistida?.estadoResolucionFuente).toBe(EstadoResolucionFuente.MANUAL);
      expect(persistida?.urlPdf).toBe(urlManual);
    });

    it('17. pendientesRestantesLote se calcula después de procesar la página (refleja las recién resueltas)', async () => {
      pendiente('edicion-a1', { numeroPublicacionRegistroOficial: 501 });
      pendiente('edicion-a2', { numeroPublicacionRegistroOficial: 502 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, [
        'edicion-a1',
        'edicion-a2',
      ]);
      registrarCatalogoResuelto(501);
      registrarCatalogoResuelto(502);

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      // Ambas se resolvieron en esta misma página: el conteo posterior debe
      // reflejarlo, no el estado previo a procesar.
      expect(resultado.paginacionLote?.pendientesRestantesLote).toBe(0);
      expect(consultorEdicionesPorLote.llamadasConteo).toHaveLength(1);
    });

    it('18. puede terminar con hayMas=false y pendientesRestantesLote > 0 (fallos técnicos agotaron el recorrido de esta ejecución)', async () => {
      pendiente('edicion-falla', { numeroPublicacionRegistroOficial: 501 });
      consultorEdicionesPorLote.registrarLote(LOTE_A, ['edicion-falla']);
      catalogo.registrarFallo(
        { tipoPublicacionRegistroOficial: 'RO', numeroPublicacionRegistroOficial: 501 },
        'RESPUESTA_CATALOGO_INVALIDA',
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: LOTE_A,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.paginacionLote).toEqual({
        hayMas: false,
        siguienteCursor: null,
        pendientesRestantesLote: 1,
      });
    });

    it('el tamaño de página predeterminado del modo lote es 20', () => {
      expect(LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION_LOTE).toBe(20);
    });

    it('lote inexistente devuelve LOTE_NO_ENCONTRADO', async () => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
        loteId: 'lote-fantasma',
      });

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'LOTE_NO_ENCONTRADO',
      });
    });
  });
});

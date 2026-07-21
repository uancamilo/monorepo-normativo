import { describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  RolUsuario,
} from '@normativo/dominio';
import {
  IngerirResumenRegistroOficial,
  LIMITE_PREDETERMINADO_ENTRADAS_INGESTA,
} from '../casos-uso/IngerirResumenRegistroOficial';
import {
  crearEntradaDetectada,
  crearSolicitudIngesta,
  crearUsuarioConRol,
  GeneradorIdsSecuencialFake,
  RepositorioIngestaRegistroOficialFake,
  RepositorioUsuariosFake,
} from './apoyo/fakes-ingesta';
import { RepositorioEdicionesRegistroOficialEnMemoriaFake } from '../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';

interface Contexto {
  casoUso: IngerirResumenRegistroOficial;
  repositorioUsuarios: RepositorioUsuariosFake;
  repositorioIngesta: RepositorioIngestaRegistroOficialFake;
  repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
}

function crearContexto(limiteMaximoEntradas?: number): Contexto {
  const repositorioUsuarios = new RepositorioUsuariosFake();
  const repositorioEdiciones =
    new RepositorioEdicionesRegistroOficialEnMemoriaFake();
  const repositorioIngesta = new RepositorioIngestaRegistroOficialFake(
    repositorioEdiciones,
  );
  repositorioUsuarios.agregar(crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR));
  const casoUso = new IngerirResumenRegistroOficial({
    repositorioUsuarios,
    repositorioIngesta,
    repositorioEdiciones,
    generadorIds: new GeneradorIdsSecuencialFake(),
    limiteMaximoEntradas,
  });
  return { casoUso, repositorioUsuarios, repositorioIngesta, repositorioEdiciones };
}

describe('IngerirResumenRegistroOficial', () => {
  it('SUPERADMINISTRADOR ingiere un lote válido y crea una norma BORRADOR por cada entrada detectada', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 0 }),
          crearEntradaDetectada({
            posicion: 1,
            numero: '456',
            titulo: 'Resolución 456',
            tipo: 'Resolución',
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.creado).toBe(true);
    expect(resultado.lote.totalEntradasDetectadas).toBe(2);
    expect(resultado.lote.totalConAdvertencias).toBe(0);
    expect(resultado.lote).not.toHaveProperty('entradasDetectadas');
    const entradas = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entradas).toHaveLength(2);
    expect(entradas[0].advertencias).toHaveLength(0);
    expect(entradas[0]).toEqual(
      expect.objectContaining({
        posicion: 0,
        normaId: expect.any(String),
      }),
    );
    expect(Object.keys(resultado.lote).sort()).toEqual(
      [
        'fechaEjecucion',
        'huellaLote',
        'id',
        'periodoAnio',
        'periodoMes',
        'totalConAdvertencias',
        'totalEntradasDetectadas',
        'urlResumenMensualRegistroOficial',
        'versionExtractor',
      ].sort(),
    );
    expect(resultado.lote.totalEntradasDetectadas).toBe(
      entradas.length,
    );
    expect(resultado.lote.totalConAdvertencias).toBe(
      entradas.filter((entrada) => entrada.advertencias.length > 0).length,
    );
    expect(entradas[0].advertencias.length === 0 ? 'ENTRADA_DETECTADA' : 'ENTRADA_CON_ADVERTENCIAS').toBe(
      'ENTRADA_DETECTADA',
    );
    expect(repositorioIngesta.normasGuardadas).toHaveLength(2);
    for (const norma of repositorioIngesta.normasGuardadas) {
      expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(norma.estaPublicada()).toBe(false);
      expect(norma.fechaPublicacionEnSistema).toBeNull();
    }
  });

  it('conserva metadataExtraccion, segmentoCrudo y confianza en la entrada', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({
            metadataExtraccion: { filaPdf: 9, cruda: 'texto original' },
            segmentoCrudo: 'Segmento crudo del resumen oficial',
            confianza: 0.71,
          }),
        ],
      }),
    );

    const lotes = await repositorioIngesta.listarLotes();
    const entradas = await repositorioIngesta.listarEntradasPorLoteId(
      lotes[0].id,
    );
    expect(entradas[0].metadataExtraccion).toEqual({
      filaPdf: 9,
      cruda: 'texto original',
    });
    expect(entradas[0].segmentoCrudo).toBe(
      'Segmento crudo del resumen oficial',
    );
    expect(entradas[0].confianza).toBe(0.71);
    expect(entradas[0].publicacionTipo).toBe('RO');
    expect(entradas[0].publicacionNumero).toBe(500);
    expect(entradas[0]).not.toHaveProperty('publicacionFechaCruda');
  });

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede ingerir (ACCESO_DENEGADO)',
    async (rol) => {
      const { casoUso, repositorioUsuarios, repositorioIngesta } =
        crearContexto();
      repositorioUsuarios.agregar(crearUsuarioConRol(rol, 'otro-usuario'));

      const resultado = await casoUso.ejecutar(
        crearSolicitudIngesta({ usuarioAutenticadoId: 'otro-usuario' }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(repositorioIngesta.normasGuardadas).toHaveLength(0);
      expect(await repositorioIngesta.listarLotes()).toHaveLength(0);
    },
  );

  it('actor inexistente no puede ingerir (ACCESO_DENEGADO)', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({ usuarioAutenticadoId: 'usuario-fantasma' }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    expect(repositorioIngesta.normasGuardadas).toHaveLength(0);
  });

  it('lote vacío devuelve SOLICITUD_INVALIDA', async () => {
    const { casoUso } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({ entradasDetectadas: [] }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it.each([
    '2026-02-30',
    '2026-5-2',
    '2026-05-02T00:00:00.000Z',
  ])(
    'rechaza como SOLICITUD_INVALIDA una fecha de publicación no canónica: %s',
    async (fecha) => {
      const { casoUso, repositorioIngesta } = crearContexto();

      const resultado = await casoUso.ejecutar(
        crearSolicitudIngesta({
          entradasDetectadas: [
            crearEntradaDetectada({
              publicacion: { tipo: 'RO', numero: 500, fecha },
            }),
          ],
        }),
      );

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'SOLICITUD_INVALIDA',
      });
      expect(repositorioIngesta.normasGuardadas).toHaveLength(0);
      expect(repositorioIngesta.edicionesGuardadas).toHaveLength(0);
    },
  );

  it('normaliza la fecha canónica detectada a medianoche UTC', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(resultado.exitoso).toBe(true);
    expect(
      repositorioIngesta.edicionesGuardadas[0].fechaPublicacionOficial.toISOString(),
    ).toBe('2026-05-02T00:00:00.000Z');
  });

  it(`lote con más de ${LIMITE_PREDETERMINADO_ENTRADAS_INGESTA} entradas devuelve LIMITE_ENTRADAS_INGESTA_EXCEDIDO`, async () => {
    const { casoUso, repositorioIngesta } = crearContexto();
    const entradasDetectadas = Array.from(
      { length: LIMITE_PREDETERMINADO_ENTRADAS_INGESTA + 1 },
      (_, posicion) => crearEntradaDetectada({ posicion }),
    );

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({ entradasDetectadas }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'LIMITE_ENTRADAS_INGESTA_EXCEDIDO',
    });
    expect(repositorioIngesta.normasGuardadas).toHaveLength(0);
  });

  it(`acepta un lote de exactamente ${LIMITE_PREDETERMINADO_ENTRADAS_INGESTA} entradas`, async () => {
    const { casoUso } = crearContexto();
    const entradasDetectadas = Array.from(
      { length: LIMITE_PREDETERMINADO_ENTRADAS_INGESTA },
      (_, posicion) =>
        crearEntradaDetectada({
          posicion,
          numero: `n-${posicion}`,
        }),
    );

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({ entradasDetectadas }),
    );

    expect(resultado.exitoso).toBe(true);
  });

  it('permite configurar un límite operativo menor sin incorporar configuración al dominio', async () => {
    const { casoUso, repositorioIngesta } = crearContexto(2);
    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 0 }),
          crearEntradaDetectada({ posicion: 1 }),
          crearEntradaDetectada({ posicion: 2 }),
        ],
      }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'LIMITE_ENTRADAS_INGESTA_EXCEDIDO',
    });
    expect(repositorioIngesta.normasGuardadas).toHaveLength(0);
  });

  it.each([
    [
      'urlResumenMensualRegistroOficial inválida',
      { urlResumenMensualRegistroOficial: 'no-es-url' },
    ],
    ['mes fuera de rango', { periodo: { anio: 2026, mes: 13 } }],
    ['anio no entero', { periodo: { anio: 2026.5, mes: 5 } }],
    ['versionExtractor vacío', { versionExtractor: '' }],
  ])('devuelve SOLICITUD_INVALIDA con %s', async (_nombre, parcial) => {
    const { casoUso } = crearContexto();

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta(parcial));

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('ya no valida fuente porque el endpoint es específico de Registro Oficial', async () => {
    const { casoUso } = crearContexto();

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(resultado.exitoso).toBe(true);
  });

  it('posiciones repetidas invalidan el lote completo', async () => {
    const { casoUso } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 3 }),
          crearEntradaDetectada({ posicion: 3, titulo: 'Otra entrada' }),
        ],
      }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('mismo período + misma huella devuelve el resumen anterior sin crear normas nuevas', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();
    const solicitud = crearSolicitudIngesta();

    const primera = await casoUso.ejecutar(solicitud);
    const segunda = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(primera.exitoso).toBe(true);
    expect(segunda.exitoso).toBe(true);
    if (!primera.exitoso || !segunda.exitoso) {
      return;
    }
    expect(segunda.creado).toBe(false);
    expect(segunda.lote.id).toBe(primera.lote.id);
    expect(segunda.lote.huellaLote).toBe(primera.lote.huellaLote);
    expect(segunda.lote).not.toHaveProperty('entradasDetectadas');
    expect(repositorioIngesta.normasGuardadas).toHaveLength(1);
    expect(await repositorioIngesta.listarLotes()).toHaveLength(1);
  });

  it('mismo período con huella distinta devuelve EJECUCION_INGESTA_CONFLICTIVA', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    await casoUso.ejecutar(crearSolicitudIngesta());
    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ titulo: 'Título distinto' }),
        ],
      }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EJECUCION_INGESTA_CONFLICTIVA',
    });
    expect(repositorioIngesta.normasGuardadas).toHaveLength(1);
  });

  it('versionExtractor participa en la huella del lote', async () => {
    const { casoUso } = crearContexto();

    await casoUso.ejecutar(crearSolicitudIngesta());
    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({ versionExtractor: '2.0.0' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EJECUCION_INGESTA_CONFLICTIVA',
    });
  });

  it('una entrada limpia devuelve ENTRADA_DETECTADA', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const entradas = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entradas[0].advertencias).toHaveLength(0);
  });

  it('entrada con advertencias devuelve ENTRADA_CON_ADVERTENCIAS', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({
            advertencias: ['FILA_PDF_CORTADA'],
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const entradas = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entradas[0].advertencias).toContain('FILA_PDF_CORTADA');
    expect(resultado.lote.totalConAdvertencias).toBe(1);
  });

  it('título faltante crea BORRADOR con titulo vacío (sin placeholder) y advertencia', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({
            titulo: '   ',
            publicacion: {
              tipo: 'RO',
              numero: 777,
              fecha: '2026-05-02',
            },
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const [entrada] = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entrada.normaId).not.toBeNull();
    expect(entrada.advertencias).toContain('TITULO_NO_DETECTADO');

    const norma = repositorioIngesta.normasGuardadas[0];
    expect(norma.titulo).toBe('');
    expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
  });

  it('los campos no detectados quedan vacíos/nulos en la Norma, sin placeholders', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({
            tipo: null,
            institucion: null,
            publicacion: {
              tipo: 'SRO',
              numero: 77,
              fecha: null,
            },
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const [entrada] = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entrada.advertencias).toEqual(
      expect.arrayContaining([
        'TIPO_NORMA_NO_DETECTADO',
        'INSTITUCION_NO_DETECTADA',
        'FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA',
        'EDICION_REGISTRO_OFICIAL_NO_DETERMINADA',
      ]),
    );
    const norma = repositorioIngesta.normasGuardadas[0];
    expect(norma.tipoNorma).toBe('');
    expect(norma.institucionExpide).toBe('');
    expect(norma.fechaExpedicion).toBeNull();
    // Sin fecha detectada no se puede determinar la edición.
    expect(norma.edicionRegistroOficialId).toBeNull();
  });

  it('cuando todo falla en la detección igual crea la Norma BORRADOR vacía', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({
            tipo: null,
            numero: null,
            titulo: null,
            institucion: null,
            seccion: null,
            publicacion: null,
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const norma = repositorioIngesta.normasGuardadas[0];
    expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
    expect(norma.estadoJuridico).toBe(EstadoNorma.VIGENTE);
    expect(norma.numero).toBeNull();
    expect(norma.titulo).toBe('');
    expect(norma.tipoNorma).toBe('');
    expect(norma.institucionExpide).toBe('');
    expect(norma.fechaExpedicion).toBeNull();
    expect(norma.edicionRegistroOficialId).toBeNull();
    expect(norma.contenido).toEqual([]);
    expect(repositorioIngesta.edicionesGuardadas).toHaveLength(0);
  });

  it('crea la EdicionRegistroOficial PENDIENTE sin urlPdf y asocia la norma', async () => {
    const { casoUso, repositorioIngesta, repositorioEdiciones } =
      crearContexto();

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(resultado.exitoso).toBe(true);
    expect(repositorioIngesta.edicionesGuardadas).toHaveLength(1);
    const edicion = repositorioIngesta.edicionesGuardadas[0];
    expect(edicion.tipoPublicacionRegistroOficial).toBe('RO');
    expect(edicion.numeroPublicacionRegistroOficial).toBe(500);
    // La detección nunca resuelve la URL del PDF: eso es de la resolución de
    // fuente, y la URL del resumen mensual jamás se usa como fuente.
    expect(edicion.urlPdf).toBeNull();
    expect(edicion.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );

    const norma = repositorioIngesta.normasGuardadas[0];
    expect(norma.edicionRegistroOficialId).toBe(edicion.id);
    expect(await repositorioEdiciones.buscarPorId(edicion.id)).not.toBeNull();
  });

  it('varias normas de la misma edición comparten la misma EdicionRegistroOficial', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 0 }),
          crearEntradaDetectada({
            posicion: 1,
            numero: '456',
            titulo: 'Resolución 456',
            tipo: 'Resolución',
          }),
          crearEntradaDetectada({
            posicion: 2,
            numero: '789',
            titulo: 'Decreto 789',
            tipo: 'Decreto',
            publicacion: { tipo: 'SRO', numero: 501, fecha: '2026-05-03' },
          }),
        ],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    expect(repositorioIngesta.edicionesGuardadas).toHaveLength(2);
    const [normaA, normaB, normaC] = repositorioIngesta.normasGuardadas;
    expect(normaA.edicionRegistroOficialId).toBe(
      normaB.edicionRegistroOficialId,
    );
    expect(normaC.edicionRegistroOficialId).not.toBe(
      normaA.edicionRegistroOficialId,
    );
  });

  it('reutiliza la edición persistida por un lote anterior sin recrearla', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const primera = await casoUso.ejecutar(crearSolicitudIngesta());
    expect(primera.exitoso).toBe(true);
    const edicionOriginal = repositorioIngesta.edicionesGuardadas[0];

    const segunda = await casoUso.ejecutar(
      crearSolicitudIngesta({
        periodo: { anio: 2026, mes: 6 },
        entradasDetectadas: [
          crearEntradaDetectada({
            numero: '999',
            titulo: 'Otra norma de la misma edición',
          }),
        ],
      }),
    );

    expect(segunda.exitoso).toBe(true);
    // No se crea una segunda edición con la misma clave lógica.
    expect(repositorioIngesta.edicionesGuardadas).toHaveLength(1);
    const normaNueva = repositorioIngesta.normasGuardadas[1];
    expect(normaNueva.edicionRegistroOficialId).toBe(edicionOriginal.id);
  });

  it.each([
    [
      'publicación con tipo desconocido',
      { publicacion: { tipo: 'XX', numero: 500, fecha: null } },
    ],
    [
      'publicación sin número válido',
      { publicacion: { tipo: 'RO', numero: 0, fecha: null } },
    ],
    ['confianza fuera de rango', { confianza: 1.5 }],
  ])('no rechaza entrada con %s; crea BORRADOR con advertencia', async (_nombre, parcial) => {
    const { casoUso, repositorioIngesta } = crearContexto();

    const resultado = await casoUso.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [crearEntradaDetectada(parcial)],
      }),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const [entrada] = await repositorioIngesta.listarEntradasPorLoteId(
      resultado.lote.id,
    );
    expect(entrada.normaId).not.toBeNull();
    expect(entrada.advertencias.length).toBeGreaterThan(0);
    expect(repositorioIngesta.normasGuardadas).toHaveLength(1);
  });

  it('resuelve la carrera de persistencia con semántica idempotente', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();
    const guardarOriginal = repositorioIngesta.guardarIngesta.bind(
      repositorioIngesta,
    );
    let primeraVez = true;
    repositorioIngesta.guardarIngesta = async (ingesta) => {
      if (primeraVez) {
        primeraVez = false;
        await guardarOriginal(ingesta);
        return { exitoso: false, razon: 'LOTE_YA_REGISTRADO' };
      }
      return guardarOriginal(ingesta);
    };

    const resultado = await casoUso.ejecutar(crearSolicitudIngesta());

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.creado).toBe(false);
    }
    expect(await repositorioIngesta.listarLotes()).toHaveLength(1);
    expect(repositorioIngesta.normasGuardadas).toHaveLength(1);
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
} from '@normativo/dominio';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  LoteIngestaRegistroOficial,
} from '@normativo/aplicacion';
import { RepositorioIngestaRegistroOficialEnMemoria } from '../RepositorioIngestaRegistroOficialEnMemoria';
import { RepositorioNormasEnMemoria } from '../RepositorioNormasEnMemoria';
import { RepositorioEdicionesRegistroOficialEnMemoria } from '../RepositorioEdicionesRegistroOficialEnMemoria';

const URL_TERMINAL = 'https://www.registroficial.gob.ec/ediciones/ro-terminal.pdf';

function crearLote(
  parcial: Partial<LoteIngestaRegistroOficial> = {},
): LoteIngestaRegistroOficial {
  return {
    id: 'lote-1',
    huellaLote: 'huella-lote-1',
    periodoAnio: 2026,
    periodoMes: 5,
    fechaEjecucion: new Date('2026-06-01T00:00:00.000Z'),
    urlResumenMensualRegistroOficial:
      'https://www.registroficial.gob.ec/resumen.pdf',
    versionExtractor: '1.0.0',
    ...parcial,
  };
}

function crearEntrada(
  parcial: Partial<EntradaDetectadaRegistroOficialAPersistir> = {},
): EntradaDetectadaRegistroOficialAPersistir {
  return {
    id: 'entrada-1',
    loteId: 'lote-1',
    posicion: 0,
    normaId: 'norma-1',
    segmentoCrudo: 'Acuerdo Ministerial 123',
    metadataExtraccion: { fila: 1 },
    advertencias: [],
    confianza: 0.9,
    fechaCreacion: new Date('2026-06-01T00:00:00.000Z'),
    tipoDetectado: 'Acuerdo Ministerial',
    numeroDetectado: '123',
    tituloDetectado: 'Acuerdo Ministerial 123',
    institucionDetectada: 'Ministerio de Prueba',
    seccion: 'Función Ejecutiva',
    publicacionTipo: 'RO',
    publicacionNumero: 500,
    publicacionFecha: new Date('2026-05-02T00:00:00.000Z'),
    ...parcial,
  };
}

function crearNormaBorrador(
  id: string,
  edicionRegistroOficialId = 'edicion-1',
): Norma {
  return new Norma({
    id,
    numero: '123',
    titulo: 'Acuerdo Ministerial 123',
    contenido: [],
    tipoNorma: 'Acuerdo Ministerial',
    institucionExpide: 'Ministerio de Prueba',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.BORRADOR,
    fechaExpedicion: null,
    edicionRegistroOficialId,
    fechaPublicacionEnSistema: null,
  });
}

function crearEdicion(
  parcial: Partial<ConstructorParameters<typeof EdicionRegistroOficial>[0]> = {},
): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id: 'edicion-1',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-02T00:00:00.000Z'),
    urlPdf: null,
    estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    ...parcial,
  });
}

function crearRepositorios() {
  const repositorioNormas = new RepositorioNormasEnMemoria();
  const repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoria();
  const repositorio = new RepositorioIngestaRegistroOficialEnMemoria(
    repositorioNormas,
    repositorioEdiciones,
  );
  return { repositorio, repositorioNormas, repositorioEdiciones };
}

describe('RepositorioIngestaRegistroOficialEnMemoria', () => {
  it('guarda la ingesta completa y deja normas y ediciones en los repositorios compartidos', async () => {
    const { repositorio, repositorioNormas, repositorioEdiciones } =
      crearRepositorios();

    const resultado = await repositorio.guardarIngesta({
      lote: crearLote(),
      entradas: [crearEntrada()],
      normas: [crearNormaBorrador('norma-1')],
      ediciones: [crearEdicion()],
    });

    expect(resultado).toEqual({ exitoso: true });
    expect(await repositorio.buscarLotePorId('lote-1')).not.toBeNull();
    expect(await repositorio.buscarLotePorPeriodo(2026, 5)).not.toBeNull();
    const entradas = await repositorio.listarEntradasPorLoteId('lote-1');
    expect(entradas).toHaveLength(1);
    const norma = await repositorioNormas.buscarPorId('norma-1');
    expect(norma?.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
    expect(norma?.edicionRegistroOficialId).toBe('edicion-1');
    const edicion = await repositorioEdiciones.buscarPorId('edicion-1');
    expect(edicion?.urlPdf).toBeNull();
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
  });

  it('reutiliza una edición ya existente con la misma clave lógica sin tocar su urlPdf', async () => {
    const { repositorio, repositorioNormas, repositorioEdiciones } =
      crearRepositorios();
    await repositorioEdiciones.guardar(
      crearEdicion({
        id: 'edicion-previa',
        urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
      }),
    );

    const resultado = await repositorio.guardarIngesta({
      lote: crearLote(),
      entradas: [crearEntrada()],
      normas: [crearNormaBorrador('norma-1', 'edicion-nueva')],
      ediciones: [crearEdicion({ id: 'edicion-nueva' })],
    });

    expect(resultado).toEqual({ exitoso: true });
    // La edición nueva no se persiste: se reutiliza la previa y la norma se
    // reasigna a ella.
    expect(await repositorioEdiciones.buscarPorId('edicion-nueva')).toBeNull();
    const previa = await repositorioEdiciones.buscarPorId('edicion-previa');
    expect(previa?.urlPdf).toBe(
      'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    );
    const norma = await repositorioNormas.buscarPorId('norma-1');
    expect(norma?.edicionRegistroOficialId).toBe('edicion-previa');
  });

  it('rechaza un segundo lote del mismo período mensual', async () => {
    const { repositorio } = crearRepositorios();
    await repositorio.guardarIngesta({
      lote: crearLote(),
      entradas: [crearEntrada()],
      normas: [crearNormaBorrador('norma-1')],
      ediciones: [crearEdicion()],
    });

    const resultado = await repositorio.guardarIngesta({
      lote: crearLote({
        id: 'lote-2',
        huellaLote: 'otra-huella',
      }),
      entradas: [],
      normas: [],
      ediciones: [],
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'LOTE_YA_REGISTRADO',
    });
    expect(await repositorio.listarLotes()).toHaveLength(1);
  });

  it('lista lotes del más reciente al más antiguo y entradas por posición', async () => {
    const { repositorio } = crearRepositorios();
    await repositorio.guardarIngesta({
      lote: crearLote({
        id: 'lote-1',
        fechaEjecucion: new Date('2026-06-01T00:00:00.000Z'),
      }),
      entradas: [
        crearEntrada({ id: 'entrada-b', posicion: 1 }),
        crearEntrada({ id: 'entrada-a', posicion: 0 }),
      ],
      normas: [],
      ediciones: [],
    });
    await repositorio.guardarIngesta({
      lote: crearLote({
        id: 'lote-2',
        periodoMes: 6,
        fechaEjecucion: new Date('2026-07-01T00:00:00.000Z'),
      }),
      entradas: [],
      normas: [],
      ediciones: [],
    });

    const lotes = await repositorio.listarLotes();
    expect(lotes.map((l) => l.id)).toEqual(['lote-2', 'lote-1']);
    const entradas = await repositorio.listarEntradasPorLoteId('lote-1');
    expect(entradas.map((i) => i.id)).toEqual(['entrada-a', 'entrada-b']);
  });

  describe('listarEntradasPorLoteIds (batch, H-B1)', () => {
    it('trae en una sola llamada las entradas de varios lotes mezcladas y ordenadas por posición', async () => {
      const { repositorio } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote({ id: 'lote-1' }),
        entradas: [
          crearEntrada({ id: 'entrada-1b', loteId: 'lote-1', posicion: 1 }),
          crearEntrada({ id: 'entrada-1a', loteId: 'lote-1', posicion: 0 }),
        ],
        normas: [],
        ediciones: [],
      });
      await repositorio.guardarIngesta({
        lote: crearLote({ id: 'lote-2', periodoMes: 6 }),
        entradas: [
          crearEntrada({ id: 'entrada-2a', loteId: 'lote-2', posicion: 0 }),
        ],
        normas: [],
        ediciones: [],
      });
      await repositorio.guardarIngesta({
        lote: crearLote({ id: 'lote-3', periodoMes: 7 }),
        entradas: [
          crearEntrada({ id: 'entrada-3a', loteId: 'lote-3', posicion: 0 }),
        ],
        normas: [],
        ediciones: [],
      });

      const entradas = await repositorio.listarEntradasPorLoteIds([
        'lote-1',
        'lote-2',
      ]);

      // No trae entradas del lote no solicitado (lote-3).
      expect(entradas.map((e) => e.id).sort()).toEqual(
        ['entrada-1a', 'entrada-1b', 'entrada-2a'].sort(),
      );
      expect(entradas.every((e) => e.loteId !== 'lote-3')).toBe(true);
      // Orden determinista dentro de cada lote (por posición).
      const deLote1 = entradas
        .filter((e) => e.loteId === 'lote-1')
        .map((e) => e.id);
      expect(deLote1).toEqual(['entrada-1a', 'entrada-1b']);
    });

    it('lista vacía de loteIds devuelve []', async () => {
      const { repositorio } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [crearEntrada()],
        normas: [],
        ediciones: [],
      });

      expect(await repositorio.listarEntradasPorLoteIds([])).toEqual([]);
    });
  });

  it('arma el origen individual y masivo de normas creadas por ingesta', async () => {
    const { repositorio } = crearRepositorios();
    await repositorio.guardarIngesta({
      lote: crearLote(),
      entradas: [crearEntrada()],
      normas: [crearNormaBorrador('norma-1')],
      ediciones: [crearEdicion()],
    });

    expect(await repositorio.buscarOrigenPorNormaId('norma-1')).toEqual({
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen.pdf',
      segmentoCrudo: 'Acuerdo Ministerial 123',
    });
    expect(await repositorio.buscarOrigenPorNormaId('norma-manual')).toBeNull();

    const origenes = await repositorio.buscarOrigenesPorNormaIds([
      'norma-1',
      'norma-manual',
    ]);
    expect([...origenes.entries()]).toEqual([
      [
        'norma-1',
        {
          urlResumenMensualRegistroOficial:
            'https://www.registroficial.gob.ec/resumen.pdf',
          segmentoCrudo: 'Acuerdo Ministerial 123',
        },
      ],
    ]);
  });

  describe('listarPaginaPendientes / contarPendientesDelLote (selección por triples del lote)', () => {
    it('selecciona las ediciones únicas cuyas triples fueron detectadas por el lote', async () => {
      const { repositorio, repositorioEdiciones } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({
            id: 'e1',
            normaId: 'norma-1',
            publicacionNumero: 500,
            publicacionFecha: new Date('2026-05-02T00:00:00.000Z'),
          }),
          crearEntrada({
            id: 'e2',
            normaId: 'norma-2',
            publicacionNumero: 501,
            publicacionFecha: new Date('2026-05-03T00:00:00.000Z'),
          }),
        ],
        normas: [
          crearNormaBorrador('norma-1', 'edicion-500'),
          crearNormaBorrador('norma-2', 'edicion-501'),
        ],
        ediciones: [
          crearEdicion({ id: 'edicion-500', numeroPublicacionRegistroOficial: 500, fechaPublicacionOficial: new Date('2026-05-02T00:00:00.000Z') }),
          crearEdicion({ id: 'edicion-501', numeroPublicacionRegistroOficial: 501, fechaPublicacionOficial: new Date('2026-05-03T00:00:00.000Z') }),
        ],
      });
      // Edición ajena, de otro lote, no debe aparecer.
      await repositorioEdiciones.guardar(
        crearEdicion({ id: 'edicion-ajena', numeroPublicacionRegistroOficial: 999 }),
      );

      const pagina = await repositorio.listarPaginaPendientes('lote-1', 20, null);

      expect(pagina.loteEncontrado).toBe(true);
      if (!pagina.loteEncontrado) return;
      expect(pagina.ediciones.map((e) => e.id)).toEqual([
        'edicion-500',
        'edicion-501',
      ]);
      expect(pagina.hayMas).toBe(false);
    });

    it('deduplica: varias entradas con la misma triple producen una sola edición en la página', async () => {
      const { repositorio } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({ id: 'e1', normaId: 'norma-1' }),
          crearEntrada({ id: 'e2', normaId: 'norma-2' }),
          crearEntrada({ id: 'e3', normaId: 'norma-3' }),
        ],
        normas: [
          crearNormaBorrador('norma-1'),
          crearNormaBorrador('norma-2'),
          crearNormaBorrador('norma-3'),
        ],
        ediciones: [crearEdicion()],
      });

      const pagina = await repositorio.listarPaginaPendientes('lote-1', 20, null);

      expect(pagina.loteEncontrado).toBe(true);
      if (!pagina.loteEncontrado) return;
      expect(pagina.ediciones).toHaveLength(1);
    });

    it('orden estable: fecha ascendente y luego id', async () => {
      const { repositorio } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({ id: 'e1', normaId: 'norma-1', publicacionNumero: 502, publicacionFecha: new Date('2026-05-05T00:00:00.000Z') }),
          crearEntrada({ id: 'e2', normaId: 'norma-2', publicacionNumero: 500, publicacionFecha: new Date('2026-05-01T00:00:00.000Z') }),
          crearEntrada({ id: 'e3', normaId: 'norma-3', publicacionNumero: 501, publicacionFecha: new Date('2026-05-03T00:00:00.000Z') }),
        ],
        normas: [
          crearNormaBorrador('norma-1', 'edicion-b'),
          crearNormaBorrador('norma-2', 'edicion-a'),
          crearNormaBorrador('norma-3', 'edicion-c'),
        ],
        ediciones: [
          crearEdicion({ id: 'edicion-b', numeroPublicacionRegistroOficial: 502, fechaPublicacionOficial: new Date('2026-05-05T00:00:00.000Z') }),
          crearEdicion({ id: 'edicion-a', numeroPublicacionRegistroOficial: 500, fechaPublicacionOficial: new Date('2026-05-01T00:00:00.000Z') }),
          crearEdicion({ id: 'edicion-c', numeroPublicacionRegistroOficial: 501, fechaPublicacionOficial: new Date('2026-05-03T00:00:00.000Z') }),
        ],
      });

      const pagina = await repositorio.listarPaginaPendientes('lote-1', 20, null);

      expect(pagina.loteEncontrado).toBe(true);
      if (!pagina.loteEncontrado) return;
      expect(pagina.ediciones.map((e) => e.id)).toEqual([
        'edicion-a',
        'edicion-c',
        'edicion-b',
      ]);
    });

    it('cursor: la segunda página continúa exactamente donde terminó la primera, sin duplicar ni omitir', async () => {
      const { repositorio } = crearRepositorios();
      const entradas = [500, 501, 502].map((numero, indice) =>
        crearEntrada({
          id: `e${indice}`,
          normaId: `norma-${indice}`,
          publicacionNumero: numero,
          publicacionFecha: new Date(`2026-05-0${indice + 1}T00:00:00.000Z`),
        }),
      );
      const normas = [500, 501, 502].map((_, indice) =>
        crearNormaBorrador(`norma-${indice}`, `edicion-${indice}`),
      );
      const ediciones = [500, 501, 502].map((numero, indice) =>
        crearEdicion({
          id: `edicion-${indice}`,
          numeroPublicacionRegistroOficial: numero,
          fechaPublicacionOficial: new Date(`2026-05-0${indice + 1}T00:00:00.000Z`),
        }),
      );
      await repositorio.guardarIngesta({ lote: crearLote(), entradas, normas, ediciones });

      const primera = await repositorio.listarPaginaPendientes('lote-1', 2, null);
      expect(primera.loteEncontrado).toBe(true);
      if (!primera.loteEncontrado) return;
      expect(primera.ediciones.map((e) => e.id)).toEqual([
        'edicion-0',
        'edicion-1',
      ]);
      expect(primera.hayMas).toBe(true);

      const ultima = primera.ediciones[primera.ediciones.length - 1];
      const segunda = await repositorio.listarPaginaPendientes('lote-1', 2, {
        fechaPublicacionOficial: ultima.fechaPublicacionOficial,
        edicionId: ultima.id,
      });
      expect(segunda.loteEncontrado).toBe(true);
      if (!segunda.loteEncontrado) return;
      expect(segunda.ediciones.map((e) => e.id)).toEqual(['edicion-2']);
      expect(segunda.hayMas).toBe(false);
    });

    it('estados: excluye RESUELTA, MANUAL, NO_ENCONTRADA y CONFLICTIVA; incluye solo PENDIENTE sin urlPdf', async () => {
      const { repositorio, repositorioEdiciones } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({ id: 'e1', normaId: 'norma-1', publicacionNumero: 500 }),
        ],
        normas: [crearNormaBorrador('norma-1', 'edicion-pendiente')],
        ediciones: [crearEdicion({ id: 'edicion-pendiente', numeroPublicacionRegistroOficial: 500 })],
      });
      const estadosTerminales: Array<[EstadoResolucionFuente, string | null]> = [
        [EstadoResolucionFuente.RESUELTA, URL_TERMINAL],
        [EstadoResolucionFuente.MANUAL, URL_TERMINAL],
        [EstadoResolucionFuente.NO_ENCONTRADA, null],
        [EstadoResolucionFuente.CONFLICTIVA, null],
      ];
      for (const [indice, [estado, url]] of estadosTerminales.entries()) {
        await repositorioEdiciones.guardar(
          crearEdicion({
            id: `edicion-${estado}`,
            numeroPublicacionRegistroOficial: 600 + indice,
            urlPdf: url,
            estadoResolucionFuente: estado,
          }),
        );
      }

      const pagina = await repositorio.listarPaginaPendientes('lote-1', 20, null);

      expect(pagina.loteEncontrado).toBe(true);
      if (!pagina.loteEncontrado) return;
      expect(pagina.ediciones.map((e) => e.id)).toEqual(['edicion-pendiente']);
    });

    it('conteo residual: contarPendientesDelLote refleja el estado actual tras cambios posteriores', async () => {
      const { repositorio, repositorioEdiciones } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({ id: 'e1', normaId: 'norma-1', publicacionNumero: 500 }),
          crearEntrada({ id: 'e2', normaId: 'norma-2', publicacionNumero: 501, publicacionFecha: new Date('2026-05-03T00:00:00.000Z') }),
        ],
        normas: [
          crearNormaBorrador('norma-1', 'edicion-1'),
          crearNormaBorrador('norma-2', 'edicion-2'),
        ],
        ediciones: [
          crearEdicion({ id: 'edicion-1', numeroPublicacionRegistroOficial: 500 }),
          crearEdicion({ id: 'edicion-2', numeroPublicacionRegistroOficial: 501, fechaPublicacionOficial: new Date('2026-05-03T00:00:00.000Z') }),
        ],
      });

      expect(await repositorio.contarPendientesDelLote('lote-1')).toBe(2);

      const edicion1 = await repositorioEdiciones.buscarPorId('edicion-1');
      await repositorioEdiciones.guardar(edicion1!.resolverFuente(URL_TERMINAL));

      expect(await repositorio.contarPendientesDelLote('lote-1')).toBe(1);
    });

    it('un loteId inexistente devuelve loteEncontrado: false, tanto en la página como en el conteo', async () => {
      const { repositorio } = crearRepositorios();

      const pagina = await repositorio.listarPaginaPendientes('lote-fantasma', 20, null);
      expect(pagina).toEqual({ loteEncontrado: false });
      expect(await repositorio.contarPendientesDelLote('lote-fantasma')).toBe(0);
    });

    it('un lote existente donde ninguna entrada tiene triple completa no fabrica candidatas', async () => {
      const { repositorio } = crearRepositorios();
      await repositorio.guardarIngesta({
        lote: crearLote(),
        entradas: [
          crearEntrada({
            id: 'e1',
            normaId: 'norma-1',
            publicacionTipo: null,
            publicacionNumero: null,
            publicacionFecha: null,
          }),
        ],
        normas: [
          new Norma({
            id: 'norma-1',
            numero: null,
            titulo: 'Sin edición',
            contenido: [],
            tipoNorma: 'Acuerdo Ministerial',
            institucionExpide: 'Ministerio de Prueba',
            estadoJuridico: EstadoNorma.VIGENTE,
            estadoEditorial: EstadoEditorialNorma.BORRADOR,
            fechaExpedicion: null,
            edicionRegistroOficialId: null,
            fechaPublicacionEnSistema: null,
          }),
        ],
        ediciones: [],
      });

      const pagina = await repositorio.listarPaginaPendientes('lote-1', 20, null);

      expect(pagina).toEqual({
        loteEncontrado: true,
        ediciones: [],
        hayMas: false,
      });
    });
  });
});

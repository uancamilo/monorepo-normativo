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
});

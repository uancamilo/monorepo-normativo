import {
  EntradaDetectadaRegistroOficial,
  LoteIngestaRegistroOficial,
  ResultadoDeteccionRegistroOficial,
} from './IngestaRegistroOficial';

export type EntradaDetectadaRegistroOficialConsultada =
  EntradaDetectadaRegistroOficial & {
    resultadoDeteccion: ResultadoDeteccionRegistroOficial;
  };

export type MetricasLoteIngestaRegistroOficial = {
  totalEntradasDetectadas: number;
  totalConAdvertencias: number;
};

export type ResumenLoteIngestaRegistroOficial =
  LoteIngestaRegistroOficial & MetricasLoteIngestaRegistroOficial;

export type LoteIngestaRegistroOficialConsultado =
  ResumenLoteIngestaRegistroOficial & {
    entradasDetectadas: EntradaDetectadaRegistroOficialConsultada[];
  };

export function calcularResultadoDeteccion(
  entrada: EntradaDetectadaRegistroOficial,
): ResultadoDeteccionRegistroOficial {
  if (entrada.advertencias.length > 0) {
    return 'ENTRADA_CON_ADVERTENCIAS';
  }

  return 'ENTRADA_DETECTADA';
}

export function armarEntradaDetectadaConsultada(
  entrada: EntradaDetectadaRegistroOficial,
): EntradaDetectadaRegistroOficialConsultada {
  return {
    id: entrada.id,
    posicion: entrada.posicion,
    normaId: entrada.normaId,
    segmentoCrudo: entrada.segmentoCrudo,
    metadataExtraccion: entrada.metadataExtraccion,
    advertencias: entrada.advertencias,
    confianza: entrada.confianza,
    fechaCreacion: entrada.fechaCreacion,
    resultadoDeteccion: calcularResultadoDeteccion(entrada),
  };
}

export function calcularMetricasLoteIngesta(
  entradas: EntradaDetectadaRegistroOficial[],
): MetricasLoteIngestaRegistroOficial {
  const consultadas = entradas.map(armarEntradaDetectadaConsultada);
  return {
    totalEntradasDetectadas: entradas.length,
    totalConAdvertencias: consultadas.filter(
      (entrada) => entrada.resultadoDeteccion === 'ENTRADA_CON_ADVERTENCIAS',
    ).length,
  };
}

export function armarResumenLoteIngesta(
  lote: LoteIngestaRegistroOficial,
  entradas: EntradaDetectadaRegistroOficial[],
): ResumenLoteIngestaRegistroOficial {
  return {
    ...lote,
    ...calcularMetricasLoteIngesta(entradas),
  };
}

export function armarLoteIngestaConsultado(
  lote: LoteIngestaRegistroOficial,
  entradas: EntradaDetectadaRegistroOficial[],
): LoteIngestaRegistroOficialConsultado {
  return {
    ...armarResumenLoteIngesta(lote, entradas),
    entradasDetectadas: entradas.map(armarEntradaDetectadaConsultada),
  };
}

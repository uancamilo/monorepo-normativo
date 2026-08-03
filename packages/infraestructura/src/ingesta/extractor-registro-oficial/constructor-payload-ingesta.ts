/**
 * Ensambla el JSON final del contrato de ingesta (`IngerirResumenHttpDto`)
 * a partir del resultado puro del parser. Es el único punto donde se
 * asignan las posiciones globales (0..N-1, consecutivas, en orden de
 * lectura visual) y donde se conocen la URL del resumen mensual y la
 * versión del extractor — datos operativos que el parser no necesita.
 */

import type {
  EntradaDetectadaHttpDto,
  IngerirResumenHttpDto,
} from '../dto/ingerir-resumen-http.dto';
import type { ResultadoParseoDocumento } from './modelo-entrada-parseada';

export class PeriodoNoDetectadoError extends Error {}

export interface OpcionesConstruccionPayload {
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
}

export function construirPayloadIngesta(
  resultado: ResultadoParseoDocumento,
  opciones: OpcionesConstruccionPayload,
): IngerirResumenHttpDto {
  if (resultado.periodoDetectado === null) {
    throw new PeriodoNoDetectadoError(
      'No fue posible detectar el período (año/mes) a partir del contenido del PDF.',
    );
  }

  const entradasDetectadas: EntradaDetectadaHttpDto[] = resultado.entradas.map(
    (entrada, posicion) => ({
      posicion,
      ...entrada,
    }),
  );

  return {
    periodo: resultado.periodoDetectado,
    urlResumenMensualRegistroOficial: opciones.urlResumenMensualRegistroOficial,
    versionExtractor: opciones.versionExtractor,
    entradasDetectadas,
  };
}

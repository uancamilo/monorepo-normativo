import { EntradaDetectadaResumen } from '../modelos/IngestaRegistroOficial';

/**
 * Puerto de extracción del índice mensual (Fase 5D) a partir de bytes ya
 * descargados. Envuelve el extractor puro de Fase 5C (PDF.js + parser) sin
 * exponer sus tipos de infraestructura: devuelve exclusivamente modelos de
 * aplicación (`EntradaDetectadaResumen`).
 *
 * `versionExtractor` es la única fuente de verdad de la versión estable
 * actual: la expone el propio adaptador concreto (nunca un timestamp, build
 * ni commit), para que `Analizar` y `Confirmar` la lean del mismo lugar sin
 * duplicar la constante.
 */
export type RazonExtraccionIndiceFallida =
  | 'PDF_INDICE_INVALIDO'
  | 'PDF_INDICE_CIFRADO'
  | 'PDF_INDICE_SIN_CAPA_DE_TEXTO'
  | 'PDF_INDICE_DEMASIADO_GRANDE'
  | 'PERIODO_INDICE_NO_DETECTADO';

export type ResultadoExtraccionIndice =
  | {
      exitoso: true;
      periodoDetectado: { anio: number; mes: number };
      totalPaginas: number;
      entradasDetectadas: EntradaDetectadaResumen[];
    }
  | {
      exitoso: false;
      razon: RazonExtraccionIndiceFallida;
    };

export interface ExtractorIndiceMensualRegistroOficial {
  readonly versionExtractor: string;
  extraer(bytes: Uint8Array): Promise<ResultadoExtraccionIndice>;
}

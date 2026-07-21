/**
 * Modelos de aplicación para la ingesta por lote del resumen mensual del
 * Registro Oficial (Fase 5A). No son entidades de dominio: representan la
 * trazabilidad operativa de un resumen mensual y sus entradas detectadas.
 */

export const TIPOS_PUBLICACION_REGISTRO_OFICIAL = [
  'RO',
  'SRO',
  '2SRO',
  '3SRO',
  '4SRO',
  '5SRO',
  '6SRO',
  '7SRO',
  'EE',
  'EC',
  'EJ',
] as const;

export type TipoPublicacionRegistroOficial =
  (typeof TIPOS_PUBLICACION_REGISTRO_OFICIAL)[number];

export const RESULTADOS_DETECCION_REGISTRO_OFICIAL = [
  'ENTRADA_DETECTADA',
  'ENTRADA_CON_ADVERTENCIAS',
] as const;

export type ResultadoDeteccionRegistroOficial =
  (typeof RESULTADOS_DETECCION_REGISTRO_OFICIAL)[number];

/**
 * Datos de la edición del Registro Oficial tal como los detectó el extractor.
 * La detección identifica la edición (tipo, número, fecha); la URL del PDF
 * oficial NO se detecta aquí: la resuelve `resolucionFuenteRegistroOficial`
 * sobre la EdicionRegistroOficial. La verificación visual queda cubierta por
 * `segmentoCrudo` y la URL del resumen mensual, sin fechas textuales crudas.
 */
export type PublicacionRegistroOficialDetectada = {
  tipo: string | null;
  numero: number | null;
  fecha: string | null;
};

/** Entrada detectada por el extractor en el resumen/índice mensual. */
export type EntradaDetectadaResumen = {
  posicion: number;
  tipo: string | null;
  numero: string | null;
  titulo: string | null;
  institucion: string | null;
  seccion: string | null;
  publicacion: PublicacionRegistroOficialDetectada | null;
  segmentoCrudo: string;
  metadataExtraccion: Record<string, unknown>;
  advertencias: string[];
  confianza: number;
};

export type LoteIngestaRegistroOficial = {
  id: string;
  huellaLote: string;
  periodoAnio: number;
  periodoMes: number;
  fechaEjecucion: Date;
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
};

export type EntradaDetectadaRegistroOficial = {
  id: string;
  posicion: number;
  normaId: string;
  segmentoCrudo: string;
  metadataExtraccion: Record<string, unknown>;
  advertencias: string[];
  confianza: number;
  fechaCreacion: Date;
};

/**
 * Representación persistible de la entrada. `loteId` y los campos detectados
 * auxiliares son detalles de trazabilidad/persistencia: no dominan el lenguaje
 * HTTP, que expone entradas anidadas dentro del lote.
 */
export type EntradaDetectadaRegistroOficialAPersistir =
  EntradaDetectadaRegistroOficial & {
    loteId: string;
    tipoDetectado: string | null;
    numeroDetectado: string | null;
    tituloDetectado: string | null;
    institucionDetectada: string | null;
    seccion: string | null;
    publicacionTipo: string | null;
    publicacionNumero: number | null;
    publicacionFecha: Date | null;
  };

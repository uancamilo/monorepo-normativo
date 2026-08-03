/**
 * Salida pura del parser del índice mensual: exactamente los mismos campos
 * que `EntradaDetectadaResumen` del contrato de ingesta, salvo `posicion`.
 * El parser trabaja página por página; la posición es global al documento
 * completo y solo puede asignarse al consolidar todas las páginas en orden
 * de lectura visual, así que la asigna quien orquesta el documento
 * (`parsearDocumento`), no el parser de cada página.
 */

import type { PublicacionRegistroOficialDetectada } from '@normativo/aplicacion';

export interface EntradaParseada {
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
}

/** Resultado de parsear el documento completo (todas las páginas, en orden). */
export interface ResultadoParseoDocumento {
  periodoDetectado: { anio: number; mes: number } | null;
  entradas: EntradaParseada[];
}

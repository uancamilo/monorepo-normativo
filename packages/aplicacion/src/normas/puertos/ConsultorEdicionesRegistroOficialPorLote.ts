import { EdicionRegistroOficial } from '@normativo/dominio';

/**
 * Posición de continuación dentro del orden estable de una página de
 * ediciones de un lote (`fechaPublicacionOficial` ASC, `id` ASC). No incluye
 * `loteId`: quien decodifica el cursor opaco recibido por HTTP ya validó que
 * pertenece al lote de la solicitud antes de llegar a este puerto.
 */
export type CursorEdicionesLote = {
  fechaPublicacionOficial: Date;
  edicionId: string;
};

export type PaginaEdicionesLote = {
  /** Página ya recortada a `limite`, ordenada de forma estable. */
  ediciones: EdicionRegistroOficial[];
  /** Existen más ediciones PENDIENTE del lote después de esta página. */
  hayMas: boolean;
};

export type ResultadoConsultaEdicionesLote =
  | ({ loteEncontrado: true } & PaginaEdicionesLote)
  | { loteEncontrado: false };

/**
 * Puerto de solo lectura para paginar, de forma set-based (sin recorrer
 * Normas ni una consulta por entrada), las ediciones únicas `PENDIENTE` sin
 * `urlPdf` originadas por las triples (tipoPublicacionRegistroOficial,
 * numeroPublicacionRegistroOficial, fechaPublicacionOficial) ya persistidas
 * en las entradas de un lote de ingesta concreto.
 *
 * Usa deliberadamente la triple detectada por el extractor y persistida en
 * `EntradaDetectadaRegistroOficial`, nunca la asociación editorial actual de
 * la Norma (`edicionRegistroOficialId`): un editor puede reasignar después la
 * edición principal de una Norma sin que eso cambie qué ediciones detectó
 * originalmente el lote.
 */
export interface ConsultorEdicionesRegistroOficialPorLote {
  /**
   * Página estable de ediciones únicas PENDIENTE sin `urlPdf` asociadas al
   * lote, después de `cursor` (si se provee). `loteEncontrado: false`
   * distingue un `loteId` inexistente de un lote real sin pendientes (que
   * devuelve `ediciones: []`, `hayMas: false`).
   */
  listarPaginaPendientes(
    loteId: string,
    limite: number,
    cursor: CursorEdicionesLote | null,
  ): Promise<ResultadoConsultaEdicionesLote>;

  /**
   * Cuenta, después de procesar una página, cuántas ediciones únicas del
   * lote continúan `PENDIENTE` sin `urlPdf` — incluidas las que fallaron
   * técnicamente antes del cursor actual. Independiente de la posición del
   * cursor: siempre recorre el lote completo.
   */
  contarPendientesDelLote(loteId: string): Promise<number>;
}

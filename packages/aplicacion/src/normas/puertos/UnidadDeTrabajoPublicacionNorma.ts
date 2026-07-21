import { Norma } from '@normativo/dominio';
import { EventoNormaPublicada } from './PublicadorEventosNormas';

/**
 * Resultado de la publicación condicionada: la transición a PUBLICADA solo
 * aplica si la norma sigue en BORRADOR y sigue cumpliendo las precondiciones
 * de publicación al momento de persistir. Ambos desenlaces son conflictos
 * esperados, nunca errores de infraestructura:
 *
 * - `NORMA_YA_PUBLICADA`: otra publicación ganó la carrera y la norma ya
 *   está PUBLICADA.
 * - `NORMA_MODIFICADA_CONCURRENTEMENTE`: la norma sigue en BORRADOR pero una
 *   modificación concurrente la dejó sin algún campo obligatorio o asociada
 *   a una edición sin fuente publicable después de la validación del caso de
 *   uso. La razón no detalla el campo: la validación normal pertenece a
 *   dominio/aplicación; esta es una barrera de consistencia concurrente.
 */
export type ResultadoGuardarPublicacion =
  | {
      publicada: true;
      tieneContenidoCompleto: boolean;
    }
  | {
      publicada: false;
      razon: 'NORMA_YA_PUBLICADA' | 'NORMA_MODIFICADA_CONCURRENTEMENTE';
    };

export interface UnidadDeTrabajoPublicacionNorma {
  /**
   * En la misma transacción: marca la norma como PUBLICADA (solo estado
   * editorial y fecha de publicación en sistema, sin reescribir los datos
   * editoriales con la copia leída) y registra el evento de publicación con
   * `tieneContenidoCompleto` calculado sobre el estado persistido vigente.
   * La transición exige atómicamente que la norma siga en BORRADOR, conserve
   * sus campos obligatorios de publicación y esté asociada a una edición con
   * fuente publicable (MANUAL o RESUELTA con urlPdf); si alguna precondición
   * ya no se cumple no escribe nada y reporta el conflicto tipado. Cualquier
   * fallo inesperado al persistir el evento revierte la transacción completa
   * y se propaga.
   */
  guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<ResultadoGuardarPublicacion>;
}

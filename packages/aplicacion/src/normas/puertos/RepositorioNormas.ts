import { EstadoEditorialNorma, Norma } from '@normativo/dominio';

export type FiltroListarNormas = {
  estadoEditorial?: EstadoEditorialNorma;
};

/**
 * Resultado de la corrección editorial condicionada: la actualización solo
 * aplica si la norma continúa en BORRADOR al momento de persistir. En éxito
 * devuelve la norma tal como quedó persistida (nunca una proyección obsoleta).
 */
export type ResultadoActualizarNormaBorrador =
  | { actualizada: true; norma: Norma }
  | {
      actualizada: false;
      razon: 'NORMA_NO_ENCONTRADA' | 'NORMA_NO_EDITABLE';
    };

/**
 * Resultado del reemplazo de la edición principal, condicionado al estado
 * editorial esperado: si la norma cambió de estado concurrentemente, la
 * operación no se aplica. En éxito devuelve la norma persistida y los ids de
 * sus ediciones de cambio resultantes (la principal anterior queda entre
 * ellos; la nueva principal se retira de los cambios si estaba allí).
 */
export type ResultadoReemplazarEdicionPrincipal =
  | { actualizada: true; norma: Norma; edicionesCambioIds: string[] }
  | {
      actualizada: false;
      razon: 'NORMA_NO_ENCONTRADA' | 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE';
    };

export interface RepositorioNormas {
  buscarPorId(id: string): Promise<Norma | null>;
  listar(filtro?: FiltroListarNormas): Promise<Norma[]>;
  /** Alta de una norma nueva (registro manual e ingesta). No usar para correcciones. */
  guardar(norma: Norma): Promise<void>;
  /**
   * Corrección editorial condicionada: escribe únicamente los datos
   * editoriales (número, título, contenido, tipo, institución, estado
   * jurídico, fecha de expedición) y solo si la norma sigue en BORRADOR.
   * Nunca toca estado editorial, edición asociada ni fecha de publicación.
   */
  actualizarBorrador(norma: Norma): Promise<ResultadoActualizarNormaBorrador>;
  /**
   * Reemplaza la edición principal de la norma de forma atómica, condicionado
   * a que el estado editorial persistido siga siendo el esperado. Semántica:
   *
   * - si la norma no tenía principal, asigna la nueva (sin crear cambios);
   * - si la nueva ya es la principal, es idempotente (no duplica ni altera);
   * - si tenía otra principal: agrega la anterior como cambio, retira la nueva
   *   de los cambios si estaba allí, y asigna la nueva como principal.
   *
   * Todo o nada: si falla cualquier paso, no se aplica ninguno. Una norma
   * nunca queda con cambios sin principal, ni con la misma edición como
   * principal y cambio.
   */
  reemplazarEdicionPrincipalSiEstado(
    normaId: string,
    nuevaEdicionPrincipalId: string,
    estadoEditorialEsperado: EstadoEditorialNorma,
  ): Promise<ResultadoReemplazarEdicionPrincipal>;
}

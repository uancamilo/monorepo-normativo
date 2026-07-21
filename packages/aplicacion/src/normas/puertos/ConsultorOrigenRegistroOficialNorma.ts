import { OrigenRegistroOficialNorma } from '../modelos/VistaEditorialNorma';

/**
 * Puerto de solo lectura para armar el bloque `origenRegistroOficial` del
 * listado y detalle editorial cuando la norma nació desde la ingesta del
 * Registro Oficial. Lo implementa el repositorio de ingesta.
 */
export interface ConsultorOrigenRegistroOficialNorma {
  buscarOrigenPorNormaId(
    normaId: string,
  ): Promise<OrigenRegistroOficialNorma | null>;

  /**
   * Recupera en bloque el origen de varias normas para evitar una consulta
   * por elemento en listados editoriales grandes.
   */
  buscarOrigenesPorNormaIds(
    normaIds: string[],
  ): Promise<ReadonlyMap<string, OrigenRegistroOficialNorma>>;
}

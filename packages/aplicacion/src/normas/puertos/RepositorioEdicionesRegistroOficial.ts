import {
  ClaveEdicionRegistroOficial,
  EdicionRegistroOficial,
  EstadoResolucionFuente,
} from '@normativo/dominio';

export type ResultadoCrearORecuperarEdicionRegistroOficial = {
  edicion: EdicionRegistroOficial;
  esNueva: boolean;
};

export type ResultadoGuardarResolucionFuenteRegistroOficial = {
  actualizada: boolean;
  /** Estado persistido después del intento; null si la edición dejó de existir. */
  edicionActual: EdicionRegistroOficial | null;
};

/**
 * Persistencia de las ediciones del Registro Oficial. La clave lógica es
 * (tipoPublicacionRegistroOficial, numeroPublicacionRegistroOficial,
 * fechaPublicacionOficial): varias normas comparten la misma edición.
 */
export interface RepositorioEdicionesRegistroOficial {
  buscarPorId(id: string): Promise<EdicionRegistroOficial | null>;
  buscarPorIds(ids: string[]): Promise<EdicionRegistroOficial[]>;
  buscarPorClave(
    clave: ClaveEdicionRegistroOficial,
  ): Promise<EdicionRegistroOficial | null>;
  listar(): Promise<EdicionRegistroOficial[]>;
  listarPorEstadoResolucionFuente(
    estados: EstadoResolucionFuente[],
  ): Promise<EdicionRegistroOficial[]>;
  /**
   * Intenta crear y deja que la restricción UNIQUE de la clave lógica decida
   * carreras. Si otra operación ganó, recupera esa edición sin sobrescribirla.
   */
  crearORecuperar(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoCrearORecuperarEdicionRegistroOficial>;
  /**
   * Persiste una resolución automática solo si la fila continúa PENDIENTE y
   * sin URL. Una escritura manual o resolución concurrente gana la carrera.
   */
  guardarResolucionSiPendiente(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoGuardarResolucionFuenteRegistroOficial>;
  guardar(edicion: EdicionRegistroOficial): Promise<void>;
}

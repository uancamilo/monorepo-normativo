/**
 * Estado de la resolución de la URL del PDF oficial de una edición del
 * Registro Oficial. La fuente pertenece a la edición, no a cada norma.
 */
export enum EstadoResolucionFuente {
  PENDIENTE = 'PENDIENTE',
  RESUELTA = 'RESUELTA',
  CONFLICTIVA = 'CONFLICTIVA',
  NO_ENCONTRADA = 'NO_ENCONTRADA',
  MANUAL = 'MANUAL',
}

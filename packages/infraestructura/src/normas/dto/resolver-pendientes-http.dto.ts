/**
 * DTO HTTP para `POST /ediciones-registro-oficial/resolver-pendientes`.
 * El cuerpo es opcional y estrictamente acotado: seleccionar ediciones
 * concretas (`edicionIds`) o limitar el lote de pendientes (`limite`), pero
 * nunca ambos — `edicionIds` y `limite` son mutuamente excluyentes (400
 * SOLICITUD_INVALIDA). Se rechazan propiedades adicionales. La validación
 * profunda (exclusión mutua, duplicados, máximos) la hace el caso de uso.
 */
export class ResolverPendientesHttpDto {
  edicionIds?: string[];
  limite?: number;
}

/**
 * DTO HTTP para `POST /ediciones-registro-oficial/resolver-pendientes`.
 * El cuerpo es opcional y estrictamente acotado: seleccionar ediciones
 * concretas (`edicionIds`), limitar el lote global de pendientes (`limite`)
 * o paginar las ediciones únicas de un lote de ingesta (`loteId`, con
 * `limite`/`cursor` opcionales) — `edicionIds` es mutuamente excluyente con
 * los demás; `cursor` exige `loteId` (400 SOLICITUD_INVALIDA en cualquier
 * combinación inválida). Se rechazan propiedades adicionales. La validación
 * profunda (exclusión mutua, formato del cursor, máximos) la hace el caso
 * de uso.
 */
export class ResolverPendientesHttpDto {
  edicionIds?: string[];
  limite?: number;
  loteId?: string;
  cursor?: string;
}

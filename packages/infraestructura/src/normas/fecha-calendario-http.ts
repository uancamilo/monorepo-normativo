import { parsearFechaCalendario } from '@normativo/dominio';
import { razonAExcepcionHttp } from './mapeo-http';

/**
 * Frontera HTTP estricta para días calendario: no acepta datetimes, offsets
 * ni la normalización flexible de `new Date(string)`.
 */
export function interpretarFechaCalendarioHttp(valor: unknown): Date {
  const fecha =
    typeof valor === 'string' ? parsearFechaCalendario(valor) : null;
  if (fecha === null) {
    throw razonAExcepcionHttp('SOLICITUD_INVALIDA');
  }
  return fecha;
}

/**
 * Variante nullable del mismo contrato de día calendario: ausente, `null` o
 * cadena vacía se interpretan como sin fecha; cualquier otro valor debe ser un
 * `YYYY-MM-DD` estricto (los datetimes con hora se rechazan). Sirve tanto para
 * `fechaExpedicion` como para la fecha de la triple del Registro Oficial.
 */
export function interpretarFechaCalendarioHttpNullable(
  valor: unknown,
): Date | null {
  if (
    valor === null ||
    valor === undefined ||
    (typeof valor === 'string' && valor.trim().length === 0)
  ) {
    return null;
  }
  return interpretarFechaCalendarioHttp(valor);
}

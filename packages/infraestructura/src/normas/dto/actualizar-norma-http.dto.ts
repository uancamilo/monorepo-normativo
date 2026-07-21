/**
 * DTO HTTP de entrada para corregir una norma en BORRADOR (PATCH parcial).
 * Los campos ausentes no cambian; `null` o texto vacío limpian el campo.
 * La validación de negocio la hace el caso de uso.
 *
 * La triple de publicación (tipo, número, fecha) pertenece a
 * EdicionRegistroOficial y no es editable aquí. Fuente tampoco lo es.
 */
export class ActualizarNormaHttpDto {
  tipoNorma?: string;
  numero?: string | null;
  titulo?: string;
  institucionExpide?: string;
  fechaExpedicion?: string | null;
  estadoJuridico?: string | null;
  contenido?: string[];
}

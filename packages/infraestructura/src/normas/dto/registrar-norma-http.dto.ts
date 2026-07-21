/**
 * DTO HTTP de entrada para registrar una norma.
 * Contrato público de la API; no se acopla a los tipos internos de aplicación.
 * No usa class-validator en Fase 3A: la validación la hace el caso de uso.
 *
 * La norma no persiste fuente ni triple de publicación: la triple (tipo,
 * número, fecha) identifica la EdicionRegistroOficial (crearla o reutilizarla).
 * Contenido es array (string[]), nunca string ni null.
 * Fuente se resuelve después en nivel de EdicionRegistroOficial, no se envía aquí.
 */
export class RegistrarNormaHttpDto {
  numero?: string | null;
  titulo!: string;
  contenido?: string[];
  tipoNorma!: string;
  institucionExpide!: string;
  estadoJuridico?: string;
  fechaExpedicion?: string | null;
  tipoPublicacionRegistroOficial?: string;
  numeroPublicacionRegistroOficial?: number | null;
  fechaPublicacionOficial?: string | null;
}

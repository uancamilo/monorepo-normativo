/**
 * DTO HTTP de entrada para registrar una norma.
 * Contrato público de la API; no se acopla a los tipos internos de aplicación.
 * No usa class-validator en Fase 3A: la validación la hace el caso de uso.
 */
export class RegistrarNormaHttpDto {
  numero?: string | null;
  titulo!: string;
  contenido?: string;
  tipoNorma!: string;
  institucionExpide!: string;
  fuente!: string;
  estadoJuridico?: string;
  fechaExpedicion!: string;
  fechaPublicacionOficial!: string;
}

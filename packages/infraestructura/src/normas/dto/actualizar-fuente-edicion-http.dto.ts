/**
 * DTO HTTP de entrada para la corrección manual de la fuente (URL del PDF
 * oficial) de una edición del Registro Oficial. La corrección aplica a la
 * edición completa y, por proyección, a todas sus normas asociadas.
 * La validación de negocio (URL real, permisos) la hace el caso de uso.
 */
export class ActualizarFuenteEdicionHttpDto {
  urlPdf!: string;
}

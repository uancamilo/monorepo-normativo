/**
 * DTO HTTP de entrada para la publicación múltiple de normas.
 * La validación de negocio (ids, límite, permisos) la hace el caso de uso.
 */
export class PublicarNormasHttpDto {
  normaIds!: string[];
  fechaPublicacionEnSistema?: string;
}

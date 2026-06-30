/**
 * DTO HTTP de entrada para publicar una norma.
 * fechaPublicacionEnSistema es opcional; si no viene, PublicarNorma usa la fecha actual.
 */
export class PublicarNormaHttpDto {
  fechaPublicacionEnSistema?: string;
}

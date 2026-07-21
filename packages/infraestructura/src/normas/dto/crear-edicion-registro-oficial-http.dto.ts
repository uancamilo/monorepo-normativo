/**
 * DTO HTTP para crear una edición manual del Registro Oficial.
 * Solo EDITOR y SUPERADMINISTRADOR pueden crear.
 * Si ya existe la misma triple, se devuelve conflicto (no duplicado).
 */
export class CrearEdicionRegistroOficialHttpDto {
  tipoPublicacionRegistroOficial!: string;
  numeroPublicacionRegistroOficial!: number;
  fechaPublicacionOficial!: string; // ISO date
  urlPdf!: string;
}

/**
 * Puerto de solo lectura hacia el catálogo/página oficial del Registro
 * Oficial, donde se buscan las URLs reales de los PDFs de cada edición.
 * La búsqueda principal es por tipo + número de publicación; la fecha
 * detectada se usa después como criterio de confianza, no de búsqueda.
 *
 * El adaptador real (scraping del catálogo) no se implementa en esta fase:
 * el contrato queda preparado para `resolucionFuenteRegistroOficial`.
 */
export type ConsultaCatalogoRegistroOficial = {
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
};

export type EdicionCatalogoRegistroOficial = {
  urlPdf: string;
  fechaPublicacionOficial: Date | null;
};

export interface CatalogoRegistroOficial {
  buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<EdicionCatalogoRegistroOficial[]>;
}

/**
 * Puerto de solo lectura hacia el catálogo/página oficial del Registro
 * Oficial, donde se buscan las URLs reales de los PDFs de cada edición.
 *
 * La búsqueda se hace por tipo + número + fecha de publicación: el catálogo
 * oficial se organiza por carpeta de tipo y por año/mes, así que la fecha
 * detectada durante la ingesta es imprescindible para ubicar la publicación
 * (además de servir luego como criterio de confianza al desempatar candidatas).
 * La fecha nunca se reescribe: solo localiza y verifica.
 *
 * El resultado es un tipo discriminado puro de aplicación: distingue una
 * consulta exitosa (con cero o más candidatas) de un fallo técnico, de forma
 * que la aplicación jamás confunda "el catálogo falló" con "no hay resultados".
 * No se filtran excepciones de infraestructura (HTTP, red, parsing) hacia la
 * aplicación: el adaptador las traduce a `razon`.
 */
export type ConsultaCatalogoRegistroOficial = {
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: Date;
};

export type EdicionCatalogoRegistroOficial = {
  urlPdf: string;
  fechaPublicacionOficial: Date | null;
};

export type RazonConsultaCatalogoFallida =
  /** Fallo transitorio: red, timeout, HTTP 5xx, circuito abierto o similar. */
  | 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE'
  /** El catálogo respondió, pero el cuerpo no es interpretable/confiable. */
  | 'RESPUESTA_CATALOGO_INVALIDA'
  /**
   * El catálogo no cubre la taxonomía consultada (tipo o período fuera del
   * rango soportado): NO puede afirmarse que la edición no exista. Es
   * incertidumbre, no ausencia; la edición permanece PENDIENTE.
   */
  | 'COBERTURA_CATALOGO_NO_DISPONIBLE'
  /**
   * El recorrido de la carpeta-mes quedó incompleto (p. ej. se alcanzó el
   * tope de páginas con más páginas anunciadas): la búsqueda no es confiable
   * y no puede concluirse ausencia.
   */
  | 'BUSQUEDA_CATALOGO_INCOMPLETA';

export type ResultadoConsultaCatalogoRegistroOficial =
  | {
      exitoso: true;
      candidatas: EdicionCatalogoRegistroOficial[];
    }
  | {
      exitoso: false;
      razon: RazonConsultaCatalogoFallida;
    };

export interface CatalogoRegistroOficial {
  buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<ResultadoConsultaCatalogoRegistroOficial>;
}

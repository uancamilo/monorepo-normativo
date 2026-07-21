/**
 * DTO HTTP del lote de ingesta del resumen mensual del Registro Oficial.
 * Es la forma del payload que envía el extractor externo; la validación de
 * negocio vive en el caso de uso, no aquí. La detección identifica la edición
 * (tipo, número, fecha): no incluye la URL del PDF oficial ni fechas
 * textuales crudas.
 */
export interface EntradaDetectadaHttpDto {
  posicion: number;
  tipo: string | null;
  numero: string | null;
  titulo: string | null;
  institucion: string | null;
  seccion: string | null;
  publicacion: {
    tipo: string | null;
    numero: number | null;
    fecha: string | null;
  } | null;
  segmentoCrudo: string;
  metadataExtraccion: Record<string, unknown>;
  advertencias: string[];
  confianza: number;
}

export interface IngerirResumenHttpDto {
  periodo: {
    anio: number;
    mes: number;
  };
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
  entradasDetectadas: EntradaDetectadaHttpDto[];
}

/**
 * Puerto de descarga acotada del PDF del índice mensual (Fase 5D). Devuelve
 * bytes crudos (nunca decodificados como texto) y el SHA-256 ya calculado
 * sobre el contenido completo descargado. Aplicación no conoce `fetch`,
 * `Buffer`, streams ni ningún detalle de red: el adaptador de infraestructura
 * asume el control de acceso (allowlist de host), el timeout total y el
 * límite de tamaño.
 */

export type RazonDescargaPdfIndiceFallida =
  | 'URL_PDF_INDICE_NO_PERMITIDA'
  | 'PDF_INDICE_DEMASIADO_GRANDE'
  | 'DESCARGA_INDICE_INVALIDA'
  | 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE';

export type ResultadoDescargaPdfIndice =
  | {
      exitoso: true;
      bytes: Uint8Array;
      tamanioBytes: number;
      sha256Pdf: string;
    }
  | {
      exitoso: false;
      razon: RazonDescargaPdfIndiceFallida;
    };

export interface DescargadorPdfIndiceRegistroOficial {
  descargar(urlPdf: string): Promise<ResultadoDescargaPdfIndice>;
}

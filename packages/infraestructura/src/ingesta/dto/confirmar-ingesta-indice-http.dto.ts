/**
 * DTO HTTP para `POST /ingesta/registro-oficial/indices/confirmar` (Fase 5D).
 * `sha256PdfObservado` y `versionExtractorObservada` son exactamente los
 * valores devueltos por `/analizar`: el cliente los reenvía tal cual, nunca
 * los interpreta. El cuerpo es obligatorio y estrictamente acotado.
 */
export interface ConfirmarIngestaIndiceHttpDto {
  urlPdf: string;
  periodoEsperado: {
    anio: number;
    mes: number;
  };
  sha256PdfObservado: string;
  versionExtractorObservada: string;
}

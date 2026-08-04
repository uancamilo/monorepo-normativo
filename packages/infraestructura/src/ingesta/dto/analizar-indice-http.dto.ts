/**
 * DTO HTTP para `POST /ingesta/registro-oficial/indices/analizar` (Fase 5D).
 * El cuerpo es obligatorio y estrictamente acotado: se rechazan propiedades
 * adicionales en cualquier nivel. La validación profunda (permiso de URL,
 * coincidencia de período) la hace el caso de uso.
 */
export interface AnalizarIndiceHttpDto {
  urlPdf: string;
  periodoEsperado: {
    anio: number;
    mes: number;
  };
}

/**
 * Modelo de entrada del parser puro: una representación mínima y genérica de
 * lo que cualquier extractor de texto posicional de un PDF puede producir.
 * El parser (`parser-indice-mensual.ts`) depende únicamente de estos tipos,
 * nunca de PDF.js ni de sus estructuras (`TextItem`, `PDFPageProxy`, etc.);
 * eso permite probarlo con fixtures sintéticos pequeños, sin PDF real.
 */

/** Un fragmento de texto con su posición en la página, tal como lo entrega
 * un extractor de PDF: coordenada horizontal y vertical (medida desde arriba
 * de la página, más intuitiva que el origen nativo de PDF que mide desde
 * abajo), más el nombre de la fuente tipográfica usada. */
export interface PalabraPosicionada {
  texto: string;
  x: number;
  yDesdeArriba: number;
  ancho: number;
  alto: number;
  fuente: string;
}

/** Todo el texto posicional de una página, sin agrupar todavía en líneas,
 * columnas ni párrafos: esa agrupación es responsabilidad del parser. */
export interface PaginaLeida {
  numeroPagina: number;
  anchoPagina: number;
  altoPagina: number;
  palabras: PalabraPosicionada[];
}

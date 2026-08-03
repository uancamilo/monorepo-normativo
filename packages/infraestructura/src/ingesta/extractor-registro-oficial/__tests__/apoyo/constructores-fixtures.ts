import { PaginaLeida, PalabraPosicionada } from '../../modelo-lectura-visual';

/**
 * Geometría de referencia calibrada contra el fixture PDF real (páginas A4,
 * columnas del índice mensual del Registro Oficial). Se usa solo para
 * construir fixtures legibles en los tests unitarios; el parser en sí no
 * conoce estos valores concretos — los deriva del interlineado observado en
 * cada columna real.
 */
export const ANCHO_PAGINA_REF = 595.276;
export const ALTO_PAGINA_REF = 841.89;
export const X_COLUMNA_UNICA_REF = 251.6;
export const X_COLUMNA_IZQUIERDA_REF = 65.2;
export const X_COLUMNA_DERECHA_REF = 314.65;
export const INTERLINEADO_REF = 11;
/** Salto vertical que separa dos párrafos distintos (> 2x el interlineado). */
export const SALTO_PARRAFO_REF = 24;
export const FUENTE_CUERPO = 'cuerpo';
export const FUENTE_INSTITUCION = 'institucion';
export const FUENTE_PIE_PAGINA = 'pie-pagina';

export type ColumnaFixture = 'unica' | 'izquierda' | 'derecha';

export interface LineaFixture {
  columna: ColumnaFixture;
  texto: string;
  /** Default: FUENTE_CUERPO. Usar FUENTE_INSTITUCION para encabezados. */
  fuente?: string;
  /** Si es true, se inserta un salto de párrafo antes de esta línea. La
   * primera línea de cada columna siempre inicia párrafo nuevo. */
  nuevoParrafo?: boolean;
}

function xDeColumna(columna: ColumnaFixture): number {
  switch (columna) {
    case 'unica':
      return X_COLUMNA_UNICA_REF;
    case 'izquierda':
      return X_COLUMNA_IZQUIERDA_REF;
    case 'derecha':
      return X_COLUMNA_DERECHA_REF;
  }
}

/**
 * Construye una PaginaLeida sintética a partir de líneas de texto simples,
 * asignando coordenadas Y automáticamente según el interlineado/salto de
 * párrafo de referencia. Cada línea se representa como una única palabra
 * (el parser agrupa por línea antes de tokenizar dentro de ella, así que
 * una sola palabra por línea basta para probar la segmentación en párrafos).
 */
export function construirPagina(
  numeroPagina: number,
  lineas: LineaFixture[],
  opciones: { anchoPagina?: number; altoPagina?: number; yInicial?: number } = {},
): PaginaLeida {
  const anchoPagina = opciones.anchoPagina ?? ANCHO_PAGINA_REF;
  const altoPagina = opciones.altoPagina ?? ALTO_PAGINA_REF;
  let y = opciones.yInicial ?? 90;
  const palabras: PalabraPosicionada[] = [];

  lineas.forEach((linea, indice) => {
    if (indice > 0 && linea.nuevoParrafo) {
      y += SALTO_PARRAFO_REF;
    } else if (indice > 0) {
      y += INTERLINEADO_REF;
    }
    palabras.push({
      texto: linea.texto,
      x: xDeColumna(linea.columna),
      yDesdeArriba: y,
      ancho: linea.texto.length * 5,
      alto: INTERLINEADO_REF,
      fuente: linea.fuente ?? FUENTE_CUERPO,
    });
  });

  return { numeroPagina, anchoPagina, altoPagina, palabras };
}

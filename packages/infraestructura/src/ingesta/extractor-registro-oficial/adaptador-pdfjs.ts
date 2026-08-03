/**
 * Adaptador que convierte los bytes de un PDF real en `PaginaLeida[]`
 * (modelo de entrada puro del parser) usando PDF.js.
 *
 * `pdfjs-dist` es un paquete ESM-only (sin build CommonJS desde la v4):
 * bajo `module: "commonjs"` de este proyecto, TypeScript reescribe
 * `await import(...)` a `require(...)`, lo que rompe la carga. Se fuerza un
 * `import()` dinámico real (no reescribible estáticamente en tiempo de
 * compilación) a través de `new Function`: es una adaptación local para
 * conservar el `import()` dinámico genuino bajo compilación CommonJS, no
 * una técnica documentada por el proyecto de PDF.js. Se usa el build
 * `legacy` porque el build por defecto asume APIs de navegador (p. ej.
 * `DOMMatrix`) ausentes en Node.js.
 */

import type { PaginaLeida, PalabraPosicionada } from './modelo-lectura-visual';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importDinamicoReal = new Function(
  'especificador',
  'return import(especificador)',
) as (especificador: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;

export const LIMITE_TAMANIO_BYTES = 50 * 1024 * 1024;

export class PdfInvalidoError extends Error {}
export class PdfCifradoError extends Error {}
export class PdfSinCapaDeTextoError extends Error {}
export class PdfDemasiadoGrandeError extends Error {}

function esCabeceraPdfValida(bytes: Uint8Array): boolean {
  const cabecera = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
  return cabecera === '%PDF-';
}

export async function leerPdf(bytes: Uint8Array): Promise<PaginaLeida[]> {
  if (bytes.byteLength > LIMITE_TAMANIO_BYTES) {
    throw new PdfDemasiadoGrandeError(
      `El PDF supera el límite de tamaño permitido (${LIMITE_TAMANIO_BYTES} bytes).`,
    );
  }
  if (!esCabeceraPdfValida(bytes)) {
    throw new PdfInvalidoError('El archivo no tiene una cabecera %PDF- válida.');
  }

  const pdfjs = await importDinamicoReal('pdfjs-dist/legacy/build/pdf.mjs');

  let documento;
  try {
    documento = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false })
      .promise;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new PdfCifradoError(
        'El PDF está protegido con contraseña: no soportado por este extractor.',
      );
    }
    throw new PdfInvalidoError(
      `No se pudo abrir el PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const paginas: PaginaLeida[] = [];
  let totalCaracteresDeTexto = 0;

  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina);
    const viewport = pagina.getViewport({ scale: 1 });
    const contenido = await pagina.getTextContent();

    const palabras: PalabraPosicionada[] = contenido.items
      .filter(
        (item): item is Extract<(typeof contenido.items)[number], { str: string }> =>
          'str' in item,
      )
      .map((item) => {
        totalCaracteresDeTexto += item.str.trim().length;
        return {
          texto: item.str,
          x: item.transform[4],
          yDesdeArriba: viewport.height - item.transform[5],
          ancho: item.width,
          alto: item.height,
          fuente: item.fontName,
        };
      });

    paginas.push({
      numeroPagina,
      anchoPagina: viewport.width,
      altoPagina: viewport.height,
      palabras,
    });
  }

  if (totalCaracteresDeTexto === 0) {
    throw new PdfSinCapaDeTextoError(
      'El PDF no tiene capa de texto extraíble (posible escaneo/imagen): no soportado sin OCR, fuera de alcance de este bloque.',
    );
  }

  return paginas;
}

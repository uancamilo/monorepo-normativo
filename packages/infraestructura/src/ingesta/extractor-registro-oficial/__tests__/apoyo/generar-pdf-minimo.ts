/**
 * Construye PDFs mínimos, válidos a nivel de sintaxis, para probar casos
 * límite del adaptador (p.ej. un PDF real sin ningún texto, como un
 * escaneo) sin depender de binarios externos ni de una librería de
 * escritura de PDF.
 */

/** PDF de una página en blanco, sin ningún operador de texto: el adaptador
 * debe detectarlo como "sin capa de texto extraíble". */
export function construirPdfSinTexto(): Buffer {
  const partes: string[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  function agregar(texto: string): void {
    partes.push(texto);
    cursor += Buffer.byteLength(texto, 'latin1');
  }

  agregar('%PDF-1.4\n');

  offsets[1] = cursor;
  agregar('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');

  offsets[2] = cursor;
  agregar('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n');

  offsets[3] = cursor;
  agregar(
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<<>>>>endobj\n',
  );

  const xrefOffset = cursor;
  agregar('xref\n0 4\n');
  agregar('0000000000 65535 f \n');
  for (let i = 1; i <= 3; i++) {
    agregar(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  agregar(`trailer<</Size 4/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.from(partes.join(''), 'latin1');
}

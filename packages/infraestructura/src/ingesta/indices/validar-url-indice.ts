/**
 * Validación fail-closed de la URL del PDF del índice mensual (Fase 5D).
 * A diferencia de `esOrigenSeguro` (Fase 5B), que acepta `http:` en
 * `localhost` para el propio servidor de pruebas del catálogo, esta URL la
 * introduce un `SUPERADMINISTRADOR` real en producción: sin excepción de
 * host local. Los tests deben inyectar un doble de prueba del descargador,
 * nunca depender de esta excepción.
 *
 * El host real donde el sitio oficial aloja los PDFs de las ediciones (el
 * almacenamiento de la Corte Constitucional, verificado en Fase 5B) es el
 * único hostname permitido para el índice mensual.
 */
export const HOSTNAME_PDF_INDICE_OFICIAL = 'esacc.corteconstitucional.gob.ec';

export function esUrlIndicePermitida(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }
  if (url.username !== '' || url.password !== '') {
    return false;
  }
  // Comparación de igualdad exacta, nunca substring/includes/endsWith: el
  // parser WHATWG ya normaliza IDNA/punycode, así que cualquier homógrafo
  // Unicode falla esta igualdad de forma natural. Una IP literal o
  // "localhost" tampoco puede igualar nunca este string exacto.
  if (url.hostname.toLowerCase() !== HOSTNAME_PDF_INDICE_OFICIAL) {
    return false;
  }
  // Puerto vacío = puerto por defecto de https (443); WHATWG normaliza un
  // ":443" explícito a puerto vacío. Cualquier otro puerto explícito se
  // rechaza: el host real verificado nunca necesita uno distinto.
  if (url.port !== '') {
    return false;
  }

  return true;
}

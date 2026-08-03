import { CursorEdicionesLote } from '../../normas/puertos/ConsultorEdicionesRegistroOficialPorLote';

/**
 * Cursor opaco de continuación de la paginación por `loteId`. Codifica en
 * Base64URL un objeto JSON versionado; el cliente nunca debe interpretar su
 * contenido, solo reenviarlo tal cual. No contiene secretos.
 */
const VERSION_CURSOR_EDICIONES_LOTE = 1;

type CursorEdicionesLoteSerializado = {
  v: number;
  loteId: string;
  fecha: string;
  edicionId: string;
};

export function codificarCursorEdicionesLote(
  loteId: string,
  cursor: CursorEdicionesLote,
): string {
  const payload: CursorEdicionesLoteSerializado = {
    v: VERSION_CURSOR_EDICIONES_LOTE,
    loteId,
    fecha: cursor.fechaPublicacionOficial.toISOString().slice(0, 10),
    edicionId: cursor.edicionId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

/**
 * Decodifica y valida estrictamente un cursor recibido del cliente. Devuelve
 * `null` ante cualquier estructura inválida, versión desconocida, o un
 * cursor que no pertenece al `loteId` de la solicitud actual — el llamador
 * trata `null` como `SOLICITUD_INVALIDA`, nunca como "sin cursor".
 */
export function decodificarCursorEdicionesLote(
  loteId: string,
  valor: string,
): CursorEdicionesLote | null {
  const bytes = decodificarBase64UrlCanonico(valor);
  if (bytes === null) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf-8'));
  } catch {
    return null;
  }

  if (!esCursorSerializadoValido(json)) {
    return null;
  }
  if (json.v !== VERSION_CURSOR_EDICIONES_LOTE) {
    return null;
  }
  if (json.loteId !== loteId) {
    return null;
  }
  const fecha = interpretarFechaCursor(json.fecha);
  if (fecha === null) {
    return null;
  }

  return { fechaPublicacionOficial: fecha, edicionId: json.edicionId };
}

const ALFABETO_BASE64URL_SIN_PADDING = /^[A-Za-z0-9_-]+$/;

/**
 * `Buffer.from(valor, 'base64url')` decodifica de forma tolerante: ignora
 * caracteres ajenos al alfabeto, padding sobrante y bits no canónicos del
 * último grupo. Eso permite que un cursor válido seguido de basura ("!!",
 * "=", espacios, saltos de línea) siga decodificando al mismo JSON. El
 * round-trip (recodificar los bytes decodificados y exigir igualdad exacta
 * con el texto recibido) es lo único que expone cualquiera de esas
 * variantes no canónicas.
 */
function decodificarBase64UrlCanonico(valor: string): Buffer | null {
  if (!ALFABETO_BASE64URL_SIN_PADDING.test(valor)) {
    return null;
  }
  const bytes = Buffer.from(valor, 'base64url');
  return bytes.toString('base64url') === valor ? bytes : null;
}

/** Claves exactas del cursor serializado: ni falta ni sobra ninguna. */
const CLAVES_CURSOR_ESPERADAS: ReadonlyArray<
  keyof CursorEdicionesLoteSerializado
> = ['v', 'loteId', 'fecha', 'edicionId'];

function esCursorSerializadoValido(
  valor: unknown,
): valor is CursorEdicionesLoteSerializado {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return false;
  }
  const claves = Object.keys(valor);
  if (
    claves.length !== CLAVES_CURSOR_ESPERADAS.length ||
    !CLAVES_CURSOR_ESPERADAS.every((clave) => claves.includes(clave))
  ) {
    return false;
  }
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.v === 'number' &&
    esTextoNoVacio(registro.loteId) &&
    esTextoNoVacio(registro.fecha) &&
    esTextoNoVacio(registro.edicionId)
  );
}

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Valida que `valor` sea una fecha calendario real con formato exacto
 * `YYYY-MM-DD`. `Date.UTC`/`new Date(...)` normalizan silenciosamente
 * fechas imposibles (2026-02-29 -> 2026-03-01, 2026-02-31 -> 2026-03-03):
 * `Number.isNaN(fecha.getTime())` nunca detecta esa normalización porque el
 * resultado sigue siendo una fecha válida, solo que distinta de la
 * recibida. El round-trip (reserializar y comparar contra el texto
 * original) es la única verificación que expone la diferencia.
 */
function interpretarFechaCursor(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return null;
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) {
    return null;
  }
  return fecha.toISOString().slice(0, 10) === valor ? fecha : null;
}

import {
  CONCURRENCIA_PREDETERMINADA_RESOLUCION,
  LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION,
} from '@normativo/aplicacion';
import { esOrigenSeguro } from '../normas/catalogo/CatalogoRegistroOficialHttp';

export const TIMEOUT_CATALOGO_POR_DEFECTO_MS = 15_000;
export const MAX_BYTES_RESPUESTA_CATALOGO = 5 * 1024 * 1024;

/**
 * Host real donde el catálogo oficial aloja TODOS los PDFs de las ediciones
 * (el almacenamiento de la Corte Constitucional), verificado contra las cards
 * reales del sitio en julio de 2026: los enlaces "Descargar" nunca apuntan al
 * propio registroficial.gob.ec. Es un hecho del sitio externo (como las
 * taxonomías), no un parámetro operativo: la allowlist por defecto debe
 * aceptar este host o la resolución rechazaría todas las URLs reales.
 * `CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF` lo reemplaza sin tocar código si
 * el sitio cambia de almacenamiento.
 */
export const DOMINIO_PDF_OFICIAL_VERIFICADO =
  'esacc.corteconstitucional.gob.ec';

/**
 * Límites máximos seguros y conservadores para la integración del catálogo.
 * La configuración fuera de rango produce arranque fail-fast (cuando está
 * habilitada). Ajustar un máximo exige una razón técnica documentada.
 */
export const TIMEOUT_CATALOGO_MIN_MS = 1_000;
export const TIMEOUT_CATALOGO_MAX_MS = 30_000;
export const MAX_CONCURRENCIA_MIN = 1;
export const MAX_CONCURRENCIA_MAX = 4;
export const MAX_EDICIONES_MIN = 1;
export const MAX_EDICIONES_MAX = 50;

/**
 * Configuración del catálogo oficial del Registro Oficial. Cuando está
 * deshabilitado o incompleto, `habilitado` queda en false y el módulo no
 * inyecta el adaptador real: `resolver-pendientes` responde 503
 * (CATALOGO_NO_DISPONIBLE). Cuando está habilitado pero mal configurado, la
 * validación es fail-fast en el arranque, con mensajes claros y sin secretos.
 */
export interface ConfiguracionCatalogoRegistroOficial {
  habilitado: boolean;
  baseUrl: string;
  dominiosPdfPermitidos: string[];
  timeoutMs: number;
  maxConcurrencia: number;
  maxEdicionesPorEjecucion: number;
  /**
   * Extensión operativa de la taxonomía de años (ver
   * `ubicarCarpetaRegistroOficial`): permite resolver un año nuevo del sitio
   * oficial sin esperar a un redespliegue. Nunca sobrescribe un año ya
   * verificado en `YEAR_ID_POR_ANIO`.
   */
  aniosExtra: Readonly<Record<number, number>>;
}

export function obtenerConfiguracionCatalogoRegistroOficial(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionCatalogoRegistroOficial {
  const habilitado = interpretarBooleano(
    entorno.CATALOGO_REGISTRO_OFICIAL_HABILITADO,
  );

  // Deshabilitado: ninguna otra variable de la integración se valida ni se
  // usa. Una variable opcional residual inválida no debe impedir el arranque
  // de un despliegue que no consulta el catálogo; se devuelven los valores
  // predeterminados seguros y deterministas.
  if (!habilitado) {
    return {
      habilitado: false,
      baseUrl: '',
      dominiosPdfPermitidos: [],
      timeoutMs: TIMEOUT_CATALOGO_POR_DEFECTO_MS,
      maxConcurrencia: CONCURRENCIA_PREDETERMINADA_RESOLUCION,
      maxEdicionesPorEjecucion: LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION,
      aniosExtra: {},
    };
  }

  const timeoutMs = validarEnteroEnRango(
    entorno.CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS,
    'CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS',
    TIMEOUT_CATALOGO_MIN_MS,
    TIMEOUT_CATALOGO_MAX_MS,
    TIMEOUT_CATALOGO_POR_DEFECTO_MS,
  );
  const maxConcurrencia = validarEnteroEnRango(
    entorno.CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA,
    'CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA',
    MAX_CONCURRENCIA_MIN,
    MAX_CONCURRENCIA_MAX,
    CONCURRENCIA_PREDETERMINADA_RESOLUCION,
  );
  const maxEdicionesPorEjecucion = validarEnteroEnRango(
    entorno.CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION,
    'CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION',
    MAX_EDICIONES_MIN,
    MAX_EDICIONES_MAX,
    LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION,
  );

  const baseUrl = validarBaseUrl(entorno.CATALOGO_REGISTRO_OFICIAL_BASE_URL);
  const dominiosPdfPermitidos = validarDominiosPdf(
    entorno.CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF,
  );
  const aniosExtra = validarAniosExtra(
    entorno.CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA,
  );

  return {
    habilitado: true,
    baseUrl: baseUrl.toString(),
    dominiosPdfPermitidos,
    timeoutMs,
    maxConcurrencia,
    maxEdicionesPorEjecucion,
    aniosExtra,
  };
}

function interpretarBooleano(valor: string | undefined): boolean {
  if (valor === undefined || valor.trim().length === 0) {
    return false;
  }
  const normalizado = valor.trim().toLowerCase();
  if (normalizado === 'true' || normalizado === '1') {
    return true;
  }
  if (normalizado === 'false' || normalizado === '0') {
    return false;
  }
  throw new Error(
    'CATALOGO_REGISTRO_OFICIAL_HABILITADO debe ser true o false',
  );
}

function validarBaseUrl(valor: string | undefined): URL {
  if (valor === undefined || valor.trim().length === 0) {
    throw new Error(
      'CATALOGO_REGISTRO_OFICIAL_BASE_URL debe definirse cuando el catálogo está habilitado',
    );
  }
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    throw new Error('CATALOGO_REGISTRO_OFICIAL_BASE_URL debe ser una URL válida');
  }
  if (!esOrigenSeguro(url)) {
    throw new Error(
      'CATALOGO_REGISTRO_OFICIAL_BASE_URL debe usar HTTPS (o http solo en localhost)',
    );
  }
  return url;
}

function validarDominiosPdf(valor: string | undefined): string[] {
  // Sin allowlist explícita se acepta el host verificado donde el sitio
  // oficial aloja los PDFs. Derivarla del host del catálogo sería un default
  // inútil: ninguna card real apunta a registroficial.gob.ec y toda
  // resolución fallaría en silencio como RESPUESTA_CATALOGO_INVALIDA.
  if (valor === undefined || valor.trim().length === 0) {
    return [DOMINIO_PDF_OFICIAL_VERIFICADO];
  }
  const dominios = valor
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
  if (dominios.length === 0) {
    throw new Error(
      'CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF no puede quedar vacío si se define',
    );
  }
  return dominios;
}

/**
 * `CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA`: parche operativo para resolver un
 * año que el sitio oficial ya creó pero que todavía no está consolidado en
 * `YEAR_ID_POR_ANIO`. Formato `"2027:2004,2028:2005"` (año:idDelSitio).
 * Ausente o vacía -> sin extensión (comportamiento actual). Presente y mal
 * formada -> fail-fast: es una decisión operativa deliberada, nunca debe
 * quedar en un estado ambiguo o parcialmente aplicado.
 */
function validarAniosExtra(valor: string | undefined): Record<number, number> {
  if (valor === undefined || valor.trim().length === 0) {
    return {};
  }
  const clave = 'CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA';
  const resultado: Record<number, number> = {};
  for (const par of valor.split(',')) {
    const recortado = par.trim();
    if (recortado.length === 0) {
      continue;
    }
    const partes = recortado.split(':');
    if (partes.length !== 2) {
      throw new Error(
        `${clave} debe tener el formato "anio:idDelSitio" separado por comas (ej. "2027:2004")`,
      );
    }
    const anio = Number(partes[0].trim());
    const idDelSitio = Number(partes[1].trim());
    if (
      !Number.isInteger(anio) ||
      anio < 2001 ||
      !Number.isInteger(idDelSitio) ||
      idDelSitio <= 0
    ) {
      throw new Error(
        `${clave} tiene un par inválido: "${recortado}" (el año debe ser entero >= 2001 y el id un entero positivo)`,
      );
    }
    if (anio in resultado) {
      throw new Error(`${clave} repite el año ${anio}`);
    }
    resultado[anio] = idDelSitio;
  }
  return resultado;
}

function validarEnteroEnRango(
  valor: string | undefined,
  clave: string,
  minimo: number,
  maximo: number,
  porDefecto: number,
): number {
  if (valor === undefined || valor.trim().length === 0) {
    return porDefecto;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(
      `${clave} debe ser un entero entre ${minimo} y ${maximo}`,
    );
  }
  return numero;
}

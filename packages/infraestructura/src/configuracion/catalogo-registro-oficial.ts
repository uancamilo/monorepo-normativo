import {
  CONCURRENCIA_PREDETERMINADA_RESOLUCION,
  LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION,
} from '@normativo/aplicacion';
import { esOrigenSeguro } from '../normas/catalogo/CatalogoRegistroOficialHttp';

export const TIMEOUT_CATALOGO_POR_DEFECTO_MS = 15_000;
export const MAX_BYTES_RESPUESTA_CATALOGO = 5 * 1024 * 1024;

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
    baseUrl,
  );

  return {
    habilitado: true,
    baseUrl: baseUrl.toString(),
    dominiosPdfPermitidos,
    timeoutMs,
    maxConcurrencia,
    maxEdicionesPorEjecucion,
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

function validarDominiosPdf(
  valor: string | undefined,
  baseUrl: URL,
): string[] {
  if (valor === undefined || valor.trim().length === 0) {
    return [baseUrl.host.toLowerCase()];
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

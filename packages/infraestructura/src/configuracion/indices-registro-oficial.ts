/**
 * Configuración operativa del análisis/confirmación de índices mensuales
 * por URL (Fase 5D). No forma parte de las reglas del dominio.
 *
 * `TIMEOUT_DESCARGA_INDICE_POR_DEFECTO_MS` cubre exclusivamente la descarga
 * del PDF (conexión, cabeceras y lectura completa del cuerpo): la extracción
 * en sí (PDF.js + parser) no tiene un timeout propio — es una operación
 * determinista y acotada por el tamaño ya limitado del PDF (máx. 50MB), y
 * se midió contra el fixture real de mayo de 2026 (1.07MB, 53 páginas, 869
 * entradas): ~326-592ms por ejecución (ver ADR 0011). El valor predeterminado
 * de Fase 5D, 30 segundos, coincide con el máximo permitido por Fase 5B
 * (`CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS`). Fase 5D permite, mediante
 * configuración explícita, ampliar exclusivamente la descarga hasta 60
 * segundos — un rango máximo mayor al de Fase 5B, no el mismo.
 */
export const TIMEOUT_DESCARGA_INDICE_POR_DEFECTO_MS = 30_000;
export const TIMEOUT_DESCARGA_INDICE_MIN_MS = 1_000;
export const TIMEOUT_DESCARGA_INDICE_MAX_MS = 60_000;

export interface ConfiguracionIndicesRegistroOficial {
  timeoutDescargaMs: number;
}

export function obtenerConfiguracionIndicesRegistroOficial(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionIndicesRegistroOficial {
  return {
    timeoutDescargaMs: validarEnteroEnRango(
      entorno.INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS,
      'INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS',
      TIMEOUT_DESCARGA_INDICE_MIN_MS,
      TIMEOUT_DESCARGA_INDICE_MAX_MS,
      TIMEOUT_DESCARGA_INDICE_POR_DEFECTO_MS,
    ),
  };
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
    throw new Error(`${clave} debe ser un entero entre ${minimo} y ${maximo}`);
  }
  return numero;
}

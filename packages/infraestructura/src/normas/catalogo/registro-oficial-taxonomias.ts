/**
 * Taxonomía del catálogo oficial del Registro Oficial
 * (https://www.registroficial.gob.ec). Son los IDs reales de términos de la
 * instalación WordPress: la carpeta (tipo de publicación) y los términos de
 * año/mes que el endpoint `admin-ajax` exige para listar una carpeta-mes.
 *
 * Verificados a partir del mecanismo real; no se fabrican. La cobertura de
 * años es 2001–2026 (límite actual de la taxonomía del sitio).
 *
 * Evidencia (julio 2026): cada tipo tiene una página pública de catálogo cuyo
 * árbol lateral (2001–2026, 12 meses) expone estos mismos IDs en los
 * atributos `data-id-carpeta`, `data-year-id` y `data-mes-id`:
 * - Registro Oficial:          /245427-2/  -> carpeta 1954
 * - Suplementos (1º a 7º):     /255776-2/  -> carpeta 1991
 * - Edición Especial:          /261974-2/  -> carpeta 1992
 * - Índice (resúmenes):        /265554-2/  -> carpeta 1993 (no se usa aquí:
 *   los resúmenes mensuales los procesa el extractor externo de Fase 5A)
 * - Edición Jurídica:          /266381-2/  -> carpeta 1994
 * - Ediciones Constitucionales:/267099-2/  -> carpeta 1995
 * Los enlaces "Descargar" de las cards apuntan en todos los tipos y años al
 * almacenamiento de la Corte Constitucional
 * (esacc.corteconstitucional.gob.ec), nunca al propio registroficial.gob.ec;
 * ese host es el default de la allowlist de PDFs (ver
 * configuracion/catalogo-registro-oficial.ts).
 */

/** Carpeta del catálogo por abreviatura de tipo de publicación. */
export const ID_CARPETA_POR_ABREVIATURA: Readonly<Record<string, number>> = {
  RO: 1954,
  SRO: 1991,
  '2SRO': 1991,
  '3SRO': 1991,
  '4SRO': 1991,
  '5SRO': 1991,
  '6SRO': 1991,
  '7SRO': 1991,
  EE: 1992,
  EJ: 1994,
  EC: 1995,
};

export const YEAR_ID_POR_ANIO: Readonly<Record<number, number>> = {
  2026: 2002,
  2025: 2000,
  2024: 1998,
  2023: 1978,
  2022: 1977,
  2021: 1976,
  2020: 1975,
  2019: 1974,
  2018: 1973,
  2017: 1972,
  2016: 1971,
  2015: 1970,
  2014: 1969,
  2013: 1968,
  2012: 1967,
  2011: 1966,
  2010: 1965,
  2009: 1964,
  2008: 1963,
  2007: 1962,
  2006: 1961,
  2005: 1960,
  2004: 1959,
  2003: 1958,
  2002: 1957,
  2001: 1956,
};

export const MES_ID_POR_MES: Readonly<Record<number, number>> = {
  1: 1979,
  2: 1980,
  3: 1981,
  4: 1982,
  5: 1983,
  6: 1984,
  7: 1985,
  8: 1986,
  9: 1987,
  10: 1988,
  11: 1989,
  12: 1990,
};

export const NOMBRE_MES: Readonly<Record<number, string>> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

export type UbicacionCarpetaRegistroOficial = {
  idCarpeta: number;
  yearId: number;
  mesId: number;
  nombreMes: string;
};

/**
 * Traduce (tipo, año, mes) a los términos WordPress de la carpeta-mes. Devuelve
 * null cuando la taxonomía no cubre el tipo o el período: eso es incertidumbre,
 * no ausencia — el adaptador devuelve el fallo tipado
 * `COBERTURA_CATALOGO_NO_DISPONIBLE` y la edición permanece PENDIENTE. Nunca se
 * concluye "consulta exitosa sin candidatas" por falta de cobertura.
 *
 * `aniosExtra` permite ampliar la cobertura de años sin tocar código ni
 * redesplegar (configurable vía `CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA`) para
 * el año-ID que el sitio le asigne a un año nuevo — un dato que solo se
 * conoce viendo el sitio real cuando ese año exista. Es un parche operativo
 * de urgencia, no reemplaza consolidar el año verificado en `YEAR_ID_POR_ANIO`
 * con calma: por eso `YEAR_ID_POR_ANIO` siempre gana sobre `aniosExtra` si
 * ambos definen el mismo año, para que una variable de entorno mal puesta
 * jamás sobrescriba un dato ya verificado.
 */
export function ubicarCarpetaRegistroOficial(
  tipoPublicacionRegistroOficial: string,
  anio: number,
  mes: number,
  aniosExtra: Readonly<Record<number, number>> = {},
): UbicacionCarpetaRegistroOficial | null {
  const idCarpeta = ID_CARPETA_POR_ABREVIATURA[tipoPublicacionRegistroOficial];
  const yearId = YEAR_ID_POR_ANIO[anio] ?? aniosExtra[anio];
  const mesId = MES_ID_POR_MES[mes];
  const nombreMes = NOMBRE_MES[mes];
  if (
    idCarpeta === undefined ||
    yearId === undefined ||
    mesId === undefined ||
    nombreMes === undefined
  ) {
    return null;
  }
  return { idCarpeta, yearId, mesId, nombreMes };
}

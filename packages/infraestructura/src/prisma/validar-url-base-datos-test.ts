/**
 * Wrapper tipado sobre scripts/validar-url-base-datos.js, la única fuente de
 * verdad de estas reglas (compartida con seed-prisma.js). Mantiene la misma
 * API pública que la implementación TypeScript anterior.
 */

interface ModuloValidarUrlBaseDatos {
  VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL: string;
  obtenerTestDatabaseUrlDesdeEntorno(
    entorno?: NodeJS.ProcessEnv,
  ): string | undefined;
  validarTestDatabaseUrl(valor: string, entorno?: NodeJS.ProcessEnv): string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const moduloValidarUrlBaseDatos: ModuloValidarUrlBaseDatos = require('../../scripts/validar-url-base-datos');

export const VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL =
  moduloValidarUrlBaseDatos.VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL;

export function obtenerTestDatabaseUrlDesdeEntorno(
  entorno: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return moduloValidarUrlBaseDatos.obtenerTestDatabaseUrlDesdeEntorno(entorno);
}

export function validarTestDatabaseUrl(
  valor: string,
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  return moduloValidarUrlBaseDatos.validarTestDatabaseUrl(valor, entorno);
}

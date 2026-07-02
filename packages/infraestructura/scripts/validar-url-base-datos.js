'use strict';

/**
 * Única fuente de verdad para validar URLs de base de datos de test/seed.
 *
 * Es CommonJS puro sin dependencias para poder usarse tanto desde scripts CLI
 * (seed-prisma.js) como desde TypeScript vía el wrapper tipado
 * src/prisma/validar-url-base-datos-test.ts.
 */

const HOSTS_LOCALES_PERMITIDOS = new Set(['localhost', '127.0.0.1', '::1']);

const VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL =
  'PERMITIR_TEST_DATABASE_URL_NO_LOCAL';

function obtenerTestDatabaseUrlDesdeEntorno(entorno = process.env) {
  const valor = entorno.TEST_DATABASE_URL;
  return valor === undefined ? undefined : validarTestDatabaseUrl(valor, entorno);
}

function validarTestDatabaseUrl(valor, entorno = process.env) {
  const url = parsearUrlPostgres(valor, 'TEST_DATABASE_URL');
  const permiteNoLocal =
    entorno[VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL] === 'true';
  const nombreBaseDatos = obtenerNombreBaseDatos(url);

  if (nombreBaseDatos !== 'normativo_test') {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar siempre a la base normativo_test',
    );
  }

  if (!permiteNoLocal && !HOSTS_LOCALES_PERMITIDOS.has(url.hostname)) {
    throw new Error(
      'TEST_DATABASE_URL debe usar host localhost, 127.0.0.1 o ::1 para tests locales',
    );
  }

  return valor;
}

function validarUrlPostgres(valor, nombreVariable) {
  parsearUrlPostgres(valor, nombreVariable);
  return valor;
}

function parsearUrlPostgres(valor, nombreVariable) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${nombreVariable} debe ser una URL válida`);
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${nombreVariable} debe usar protocolo postgresql`);
  }

  return url;
}

function obtenerNombreBaseDatos(url) {
  return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
}

module.exports = {
  HOSTS_LOCALES_PERMITIDOS,
  VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL,
  obtenerTestDatabaseUrlDesdeEntorno,
  validarTestDatabaseUrl,
  validarUrlPostgres,
  parsearUrlPostgres,
  obtenerNombreBaseDatos,
};

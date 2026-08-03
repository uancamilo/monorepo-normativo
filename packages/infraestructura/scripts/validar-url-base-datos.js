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

const VARIABLE_PERMITIR_TEST_DATABASE_EFIMERA =
  'PERMITIR_TEST_DATABASE_EFIMERA';

// prefijo literal `normativo_test_` + sufijo de 1 a 48 chars en minúsculas
// ASCII/dígitos/guion bajo => nombre total de máximo 63 caracteres,
// compatible con el límite de identificadores de PostgreSQL.
const PATRON_NOMBRE_BASE_EFIMERA = /^normativo_test_[a-z0-9](?:[a-z0-9_]{0,47})$/;

function obtenerTestDatabaseUrlDesdeEntorno(entorno = process.env) {
  const valor = entorno.TEST_DATABASE_URL;
  return valor === undefined ? undefined : validarTestDatabaseUrl(valor, entorno);
}

function validarTestDatabaseUrl(valor, entorno = process.env) {
  const url = parsearUrlPostgres(valor, 'TEST_DATABASE_URL');
  const nombreBaseDatos = obtenerNombreBaseDatos(url);
  const esHostLocal = esHostnameLocal(url.hostname);

  if (nombreBaseDatos === 'normativo_test') {
    const permiteNoLocal =
      entorno[VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL] === 'true';
    if (!permiteNoLocal && !esHostLocal) {
      throw new Error(
        'TEST_DATABASE_URL debe usar host localhost, 127.0.0.1 o ::1 para tests locales',
      );
    }
    return valor;
  }

  if (PATRON_NOMBRE_BASE_EFIMERA.test(nombreBaseDatos)) {
    const permiteEfimera =
      entorno[VARIABLE_PERMITIR_TEST_DATABASE_EFIMERA] === 'true';
    if (!permiteEfimera) {
      throw new Error(
        'TEST_DATABASE_URL con base efímera requiere PERMITIR_TEST_DATABASE_EFIMERA=true',
      );
    }
    // El opt-in de host remoto de normativo_test nunca se reutiliza aquí:
    // una base efímera siempre exige host local, sin excepciones.
    if (!esHostLocal) {
      throw new Error(
        'TEST_DATABASE_URL con base efímera debe usar host localhost, 127.0.0.1 o ::1',
      );
    }
    return valor;
  }

  throw new Error(
    'TEST_DATABASE_URL debe apuntar a normativo_test o a una base efímera normativo_test_<sufijo>',
  );
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

// El serializador WHATWG URL siempre envuelve los literales IPv6 entre
// corchetes en `hostname` (p. ej. "[::1]"), a diferencia de como se listan
// en HOSTS_LOCALES_PERMITIDOS ("::1"): se normaliza antes de comparar.
function esHostnameLocal(hostname) {
  const normalizado =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  return HOSTS_LOCALES_PERMITIDOS.has(normalizado);
}

module.exports = {
  HOSTS_LOCALES_PERMITIDOS,
  VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL,
  VARIABLE_PERMITIR_TEST_DATABASE_EFIMERA,
  PATRON_NOMBRE_BASE_EFIMERA,
  obtenerTestDatabaseUrlDesdeEntorno,
  validarTestDatabaseUrl,
  validarUrlPostgres,
  parsearUrlPostgres,
  obtenerNombreBaseDatos,
};

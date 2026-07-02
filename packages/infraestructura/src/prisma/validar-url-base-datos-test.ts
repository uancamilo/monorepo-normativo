const HOSTS_LOCALES_PERMITIDOS = new Set(['localhost', '127.0.0.1', '::1']);

export const VARIABLE_PERMITIR_TEST_DATABASE_URL_NO_LOCAL =
  'PERMITIR_TEST_DATABASE_URL_NO_LOCAL';

export function obtenerTestDatabaseUrlDesdeEntorno(
  entorno: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const valor = entorno.TEST_DATABASE_URL;
  return valor === undefined
    ? undefined
    : validarTestDatabaseUrl(valor, entorno);
}

export function validarTestDatabaseUrl(
  valor: string,
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  const url = parsearUrlPostgres(valor);
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

function parsearUrlPostgres(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('TEST_DATABASE_URL debe ser una URL válida');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('TEST_DATABASE_URL debe usar protocolo postgresql');
  }

  return url;
}

function obtenerNombreBaseDatos(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
}

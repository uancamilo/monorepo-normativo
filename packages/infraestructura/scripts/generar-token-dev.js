'use strict';

/**
 * Genera un Bearer token de desarrollo para probar los endpoints con curl.
 * Solo para local/test: usa JWT_SECRET del entorno o el secreto explícito de
 * desarrollo (el mismo fallback que la aplicación fuera de producción).
 *
 * Uso:
 *   node scripts/generar-token-dev.js usuario-editor-1
 *   JWT_SECRET=... node scripts/generar-token-dev.js usuario-editor-1
 */

const { SignJWT } = require('jose');

const JWT_SECRET_DESARROLLO =
  'secreto-jwt-solo-desarrollo-no-usar-en-produccion';
const DURACION_SEGUNDOS = 60 * 60;

async function main() {
  const usuarioId = process.argv[2];

  if (usuarioId === undefined || usuarioId.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.error('Uso: node scripts/generar-token-dev.js <usuario-id>');
    process.exitCode = 1;
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('Este script es solo para desarrollo/test.');
    process.exitCode = 1;
    return;
  }

  const secreto = process.env.JWT_SECRET ?? JWT_SECRET_DESARROLLO;
  const ahora = Math.floor(Date.now() / 1000);

  let token = new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + DURACION_SEGUNDOS);

  if (process.env.JWT_ISSUER) {
    token = token.setIssuer(process.env.JWT_ISSUER);
  }
  if (process.env.JWT_AUDIENCE) {
    token = token.setAudience(process.env.JWT_AUDIENCE);
  }

  // eslint-disable-next-line no-console
  console.log(await token.sign(new TextEncoder().encode(secreto)));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fallo al generar el token:', error);
  process.exitCode = 1;
});

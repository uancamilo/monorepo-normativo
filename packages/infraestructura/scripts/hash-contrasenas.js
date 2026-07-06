'use strict';

/**
 * Única fuente de verdad del hashing de contraseñas (scrypt de node:crypto).
 *
 * Es CommonJS puro para poder usarse desde el seed standalone
 * (seed-prisma.js) y desde TypeScript vía el wrapper tipado
 * src/autenticacion/hash-contrasenas.ts.
 *
 * Formato versionado: scrypt:v1:<saltBase64>:<hashBase64>
 * v1 = parámetros por defecto de scrypt en Node (N=16384, r=8, p=1),
 * salt aleatoria de 16 bytes y clave derivada de 64 bytes.
 */

const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsincrono = promisify(scrypt);

const PREFIJO = 'scrypt';
const VERSION = 'v1';
const BYTES_SALT = 16;
const BYTES_HASH = 64;

async function generarHashContrasena(contrasenaPlano) {
  if (typeof contrasenaPlano !== 'string' || contrasenaPlano.length === 0) {
    throw new Error('La contraseña no puede estar vacía para generar un hash');
  }

  const salt = randomBytes(BYTES_SALT);
  const hash = await scryptAsincrono(contrasenaPlano, salt, BYTES_HASH);

  return [
    PREFIJO,
    VERSION,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join(':');
}

/**
 * Devuelve false ante cualquier problema (formato inválido, hash corrupto,
 * contraseña vacía): nunca lanza detalles del formato hacia los llamadores.
 */
async function verificarContrasena(contrasenaPlano, hashAlmacenado) {
  try {
    if (typeof contrasenaPlano !== 'string' || contrasenaPlano.length === 0) {
      return false;
    }
    if (typeof hashAlmacenado !== 'string') {
      return false;
    }

    const partes = hashAlmacenado.split(':');
    if (partes.length !== 4 || partes[0] !== PREFIJO || partes[1] !== VERSION) {
      return false;
    }

    const salt = Buffer.from(partes[2], 'base64');
    const hashEsperado = Buffer.from(partes[3], 'base64');
    if (salt.length === 0 || hashEsperado.length === 0) {
      return false;
    }

    const hashCalculado = await scryptAsincrono(
      contrasenaPlano,
      salt,
      hashEsperado.length,
    );

    return timingSafeEqual(hashEsperado, hashCalculado);
  } catch {
    return false;
  }
}

module.exports = {
  generarHashContrasena,
  verificarContrasena,
};

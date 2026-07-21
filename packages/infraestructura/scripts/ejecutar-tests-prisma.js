'use strict';

/**
 * Runner seguro de la suite Prisma (`npm run test:prisma`).
 *
 * Endurece la frontera de datos: valida TEST_DATABASE_URL ANTES de ejecutar
 * cualquier migración. `prisma migrate deploy` es destructivo sobre el schema,
 * así que nunca debe correr contra una URL que no sea una base de test
 * verificada. La validación reutiliza la única fuente de verdad
 * (scripts/validar-url-base-datos.js); aquí no se re-parsea ninguna URL.
 *
 * Reglas:
 * - TEST_DATABASE_URL es obligatoria; DATABASE_URL NO puede sustituirla.
 * - Por defecto exige base normativo_test en host local.
 * - Solo permite URL de test no local con PERMITIR_TEST_DATABASE_URL_NO_LOCAL=true.
 * - Si falta o es insegura, el proceso termina antes de tocar Prisma.
 * - No imprime credenciales completas.
 *
 * La orquestación (migrate deploy + jest) se separa de la validación para poder
 * probar la validación sin lanzar procesos externos.
 */

const { spawnSync } = require('node:child_process');
const {
  validarTestDatabaseUrl,
} = require('./validar-url-base-datos');

/**
 * Valida TEST_DATABASE_URL y devuelve la URL segura para los procesos hijos.
 * Lanza si falta o si la URL no supera la validación de base de test.
 * No usa DATABASE_URL como alternativa bajo ninguna circunstancia.
 */
function prepararUrlTestsPrisma(entorno = process.env) {
  const valor = entorno.TEST_DATABASE_URL;
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL es obligatoria para test:prisma; DATABASE_URL no puede sustituirla',
    );
  }
  return validarTestDatabaseUrl(valor, entorno);
}

function ejecutarPaso(comando, argumentos, urlValidada) {
  const resultado = spawnSync(comando, argumentos, {
    stdio: 'inherit',
    // La URL validada se asigna a DATABASE_URL solo para los procesos hijos;
    // el entorno del runner no se muta.
    env: { ...process.env, DATABASE_URL: urlValidada },
  });
  if (resultado.error) {
    throw resultado.error;
  }
  return resultado.status === null ? 1 : resultado.status;
}

function main() {
  let urlValidada;
  try {
    urlValidada = prepararUrlTestsPrisma(process.env);
  } catch (error) {
    console.error(`test:prisma abortado: ${error.message}`);
    process.exit(1);
  }

  const codigoMigracion = ejecutarPaso(
    'prisma',
    ['migrate', 'deploy'],
    urlValidada,
  );
  if (codigoMigracion !== 0) {
    process.exit(codigoMigracion);
  }

  const codigoJest = ejecutarPaso(
    'jest',
    ['--runInBand', 'prisma'],
    urlValidada,
  );
  process.exit(codigoJest);
}

if (require.main === module) {
  main();
}

module.exports = { prepararUrlTestsPrisma };

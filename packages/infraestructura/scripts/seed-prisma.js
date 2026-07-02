'use strict';

/**
 * Seed controlado de desarrollo/test para Prisma/PostgreSQL (Fase 3C).
 *
 * - Es idempotente: usa upsert por clave primaria; ejecutarlo varias veces no
 *   duplica registros y respeta los constraints UNIQUE.
 * - Solo inserta datos de prueba (correos @test.com); NO son datos reales.
 * - NO borra normas ni ningún otro dato existente. El reset destructivo vive en
 *   el script `prisma:reset:test`, no aquí.
 * - Vive en infraestructura y usa Prisma Client de forma directa; no toca
 *   dominio ni aplicación.
 *
 * Uso como CLI:
 *   TEST_DATABASE_URL=... node scripts/seed-prisma.js
 *   DATABASE_URL=...      node scripts/seed-prisma.js
 *
 * Uso como módulo (p. ej. en un test e2e):
 *   const { sembrar } = require('../scripts/seed-prisma');
 *   await sembrar(prisma);
 */

const HOSTS_LOCALES_PERMITIDOS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizarCorreo = (correo) => correo.trim().toLowerCase();

const USUARIOS_SEMILLA = [
  {
    id: 'usuario-editor-1',
    nombre: 'Editor',
    apellido: 'Prueba',
    correoNormalizado: normalizarCorreo('editor@test.com'),
    rol: 'EDITOR',
  },
  {
    id: 'usuario-superadmin-1',
    nombre: 'Superadmin',
    apellido: 'Prueba',
    correoNormalizado: normalizarCorreo('superadmin@test.com'),
    rol: 'SUPERADMINISTRADOR',
  },
  {
    id: 'usuario-admin-1',
    nombre: 'Admin',
    apellido: 'Prueba',
    correoNormalizado: normalizarCorreo('admin@test.com'),
    rol: 'ADMINISTRADOR',
  },
  {
    id: 'usuario-suscriptor-1',
    nombre: 'Suscriptor',
    apellido: 'Prueba',
    correoNormalizado: normalizarCorreo('suscriptor@test.com'),
    rol: 'SUSCRIPTOR',
  },
];

const SUSCRIPCION_SEMILLA = {
  id: 'suscripcion-1',
  clienteId: 'cliente-1',
  cantidadMaximaUsuarios: 1,
  estado: 'ACTIVA',
  fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
  fechaFin: new Date('2100-01-01T00:00:00.000Z'),
  correosHabilitados: [
    {
      id: 'suscripcion-1-correo-1',
      correoNormalizado: normalizarCorreo('suscriptor@test.com'),
    },
  ],
};

const datosSemilla = {
  usuarios: USUARIOS_SEMILLA,
  suscripcion: SUSCRIPCION_SEMILLA,
};

/**
 * Aplica la semilla de forma idempotente sobre un Prisma Client ya conectado.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function sembrar(prisma) {
  for (const usuario of USUARIOS_SEMILLA) {
    const datos = {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correoNormalizado: usuario.correoNormalizado,
      rol: usuario.rol,
    };
    await prisma.usuario.upsert({
      where: { id: usuario.id },
      update: datos,
      create: { id: usuario.id, ...datos },
    });
  }

  const { correosHabilitados, ...suscripcion } = SUSCRIPCION_SEMILLA;
  const datosSuscripcion = {
    clienteId: suscripcion.clienteId,
    cantidadMaximaUsuarios: suscripcion.cantidadMaximaUsuarios,
    estado: suscripcion.estado,
    fechaInicio: suscripcion.fechaInicio,
    fechaFin: suscripcion.fechaFin,
  };
  await prisma.suscripcion.upsert({
    where: { id: suscripcion.id },
    update: datosSuscripcion,
    create: { id: suscripcion.id, ...datosSuscripcion },
  });

  for (const correo of correosHabilitados) {
    await prisma.suscripcionCorreoHabilitado.upsert({
      where: { correoNormalizado: correo.correoNormalizado },
      update: {
        suscripcionId: suscripcion.id,
      },
      create: {
        id: correo.id,
        suscripcionId: suscripcion.id,
        correoNormalizado: correo.correoNormalizado,
      },
    });
  }
}

async function ejecutarComoCli() {
  const url = obtenerUrlSeedDesdeEntorno(process.env);

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  try {
    await prisma.$connect();
    await sembrar(prisma);
    // eslint-disable-next-line no-console
    console.log('Seed Prisma aplicado (idempotente).');
  } finally {
    await prisma.$disconnect();
  }
}

function obtenerUrlSeedDesdeEntorno(entorno = process.env) {
  if (entorno.TEST_DATABASE_URL !== undefined) {
    return validarTestDatabaseUrl(entorno.TEST_DATABASE_URL, entorno);
  }

  if (entorno.DATABASE_URL !== undefined) {
    if (entorno.PERMITIR_SEED_DESARROLLO !== 'true') {
      throw new Error(
        'DATABASE_URL solo puede usarse para seed con PERMITIR_SEED_DESARROLLO=true',
      );
    }

    return validarUrlPostgres(entorno.DATABASE_URL, 'DATABASE_URL');
  }

  throw new Error(
    'Define TEST_DATABASE_URL o DATABASE_URL con PERMITIR_SEED_DESARROLLO=true para ejecutar el seed de Prisma',
  );
}

function validarTestDatabaseUrl(valor, entorno = process.env) {
  const url = parsearUrlPostgres(valor, 'TEST_DATABASE_URL');
  const permiteNoLocal =
    entorno.PERMITIR_TEST_DATABASE_URL_NO_LOCAL === 'true';
  const nombreBaseDatos = obtenerNombreBaseDatos(url);

  if (nombreBaseDatos !== 'normativo_test') {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar siempre a la base normativo_test para ejecutar el seed de test',
    );
  }

  if (!permiteNoLocal && !HOSTS_LOCALES_PERMITIDOS.has(url.hostname)) {
    throw new Error(
      'TEST_DATABASE_URL debe usar host localhost, 127.0.0.1 o ::1 para ejecutar el seed de test',
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
  sembrar,
  datosSemilla,
  normalizarCorreo,
  obtenerUrlSeedDesdeEntorno,
  validarTestDatabaseUrl,
};

if (require.main === module) {
  ejecutarComoCli().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Fallo el seed de Prisma:', error);
    process.exitCode = 1;
  });
}

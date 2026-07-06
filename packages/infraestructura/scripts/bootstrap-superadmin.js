'use strict';

/**
 * Bootstrap operativo del SUPERADMINISTRADOR inicial (Fase 4E).
 *
 * Mecanismo controlado para crear o actualizar el usuario SUPERADMINISTRADOR
 * y su contraseña (hash scrypt). A diferencia del seed (solo desarrollo/test),
 * este script es el camino operativo para inicializar acceso real.
 *
 * Seguridad:
 * - Requiere DATABASE_URL (no usa TEST_DATABASE_URL).
 * - Requiere confirmación explícita PERMITIR_BOOTSTRAP_SUPERADMIN=true.
 * - Host no local requiere además PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true
 *   (ejecutar contra producción es una decisión operativa consciente).
 * - Idempotente: crea el usuario si no existe; si existe por id, actualiza
 *   datos mínimos y password_hash. No borra ni toca otros usuarios/datos.
 * - Si el correo ya pertenece a OTRO usuario, falla explícitamente.
 * - Nunca imprime la contraseña ni el hash.
 *
 * Uso:
 *   PERMITIR_BOOTSTRAP_SUPERADMIN=true \
 *   DATABASE_URL="postgresql://..." \
 *   BOOTSTRAP_SUPERADMIN_CORREO="admin@ejemplo.com" \
 *   BOOTSTRAP_SUPERADMIN_PASSWORD="..." \
 *   node scripts/bootstrap-superadmin.js
 */

const {
  HOSTS_LOCALES_PERMITIDOS,
  parsearUrlPostgres,
  obtenerNombreBaseDatos,
} = require('./validar-url-base-datos');
const { generarHashContrasena } = require('./hash-contrasenas');

const LONGITUD_MINIMA_PASSWORD = 12;

const VALORES_POR_DEFECTO = {
  id: 'usuario-superadmin-inicial',
  nombre: 'Superadministrador',
  apellido: 'Inicial',
};

// Copia consciente de normalizarCorreo del dominio: script CJS standalone.
const normalizarCorreo = (correo) => correo.trim().toLowerCase();

function valorODefecto(valor, porDefecto) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return porDefecto;
  }
  return valor.trim();
}

function validarPasswordBootstrap(password) {
  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new Error('BOOTSTRAP_SUPERADMIN_PASSWORD no puede estar vacía');
  }
  if (password.length < LONGITUD_MINIMA_PASSWORD) {
    throw new Error(
      `BOOTSTRAP_SUPERADMIN_PASSWORD debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`,
    );
  }
  return password;
}

function leerConfiguracionBootstrapSuperadmin(entorno = process.env) {
  if (entorno.PERMITIR_BOOTSTRAP_SUPERADMIN !== 'true') {
    throw new Error(
      'El bootstrap requiere confirmación explícita: PERMITIR_BOOTSTRAP_SUPERADMIN=true',
    );
  }

  const databaseUrl = entorno.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error('DATABASE_URL debe estar configurada para el bootstrap');
  }

  const url = parsearUrlPostgres(databaseUrl, 'DATABASE_URL');
  const permiteNoLocal =
    entorno.PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL === 'true';
  if (!permiteNoLocal && !HOSTS_LOCALES_PERMITIDOS.has(url.hostname)) {
    throw new Error(
      'DATABASE_URL apunta a un host no local. Ejecutar el bootstrap contra una base ' +
        'remota/productiva exige PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true (decisión operativa consciente)',
    );
  }

  const correoCrudo = entorno.BOOTSTRAP_SUPERADMIN_CORREO;
  if (correoCrudo === undefined || correoCrudo.trim().length === 0) {
    throw new Error('BOOTSTRAP_SUPERADMIN_CORREO no puede estar vacío');
  }

  const password = validarPasswordBootstrap(
    entorno.BOOTSTRAP_SUPERADMIN_PASSWORD,
  );

  return {
    databaseUrl,
    // Descripción segura del objetivo (sin credenciales de conexión).
    baseObjetivo: `${url.hostname}/${obtenerNombreBaseDatos(url)}`,
    id: valorODefecto(entorno.BOOTSTRAP_SUPERADMIN_ID, VALORES_POR_DEFECTO.id),
    nombre: valorODefecto(
      entorno.BOOTSTRAP_SUPERADMIN_NOMBRE,
      VALORES_POR_DEFECTO.nombre,
    ),
    apellido: valorODefecto(
      entorno.BOOTSTRAP_SUPERADMIN_APELLIDO,
      VALORES_POR_DEFECTO.apellido,
    ),
    correoNormalizado: normalizarCorreo(correoCrudo),
    password,
  };
}

/**
 * Crea o actualiza el SUPERADMINISTRADOR objetivo. Idempotente y acotado a un
 * solo usuario; nunca borra datos.
 * @returns {{ creado: boolean }}
 */
async function bootstrapSuperadmin(prisma, configuracion) {
  const duenoDelCorreo = await prisma.usuario.findUnique({
    where: { correoNormalizado: configuracion.correoNormalizado },
    select: { id: true },
  });

  if (duenoDelCorreo !== null && duenoDelCorreo.id !== configuracion.id) {
    throw new Error(
      `El correo ya pertenece a otro usuario (id ${duenoDelCorreo.id}); ` +
        'no se modifica ningún usuario. Ajusta BOOTSTRAP_SUPERADMIN_ID o el correo.',
    );
  }

  const existente = await prisma.usuario.findUnique({
    where: { id: configuracion.id },
    select: { id: true },
  });

  const passwordHash = await generarHashContrasena(configuracion.password);
  const datos = {
    nombre: configuracion.nombre,
    apellido: configuracion.apellido,
    correoNormalizado: configuracion.correoNormalizado,
    rol: 'SUPERADMINISTRADOR',
    passwordHash,
  };

  await prisma.usuario.upsert({
    where: { id: configuracion.id },
    update: datos,
    create: { id: configuracion.id, ...datos },
  });

  return { creado: existente === null };
}

async function ejecutarComoCli() {
  const configuracion = leerConfiguracionBootstrapSuperadmin(process.env);

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg(configuracion.databaseUrl),
  });

  try {
    await prisma.$connect();
    const resultado = await bootstrapSuperadmin(prisma, configuracion);
    // Solo datos no sensibles: nunca contraseña ni hash.
    // eslint-disable-next-line no-console
    console.log(
      `Superadministrador ${resultado.creado ? 'creado' : 'actualizado'} ` +
        `(id ${configuracion.id}, correo ${configuracion.correoNormalizado}) ` +
        `en ${configuracion.baseObjetivo}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  LONGITUD_MINIMA_PASSWORD,
  validarPasswordBootstrap,
  leerConfiguracionBootstrapSuperadmin,
  bootstrapSuperadmin,
};

if (require.main === module) {
  ejecutarComoCli().catch((error) => {
    // El mensaje de error nunca contiene la contraseña ni el hash.
    // eslint-disable-next-line no-console
    console.error('Fallo el bootstrap del superadministrador:', error.message);
    process.exitCode = 1;
  });
}

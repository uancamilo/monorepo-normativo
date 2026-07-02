'use strict';

/**
 * Aplica constraints CHECK que Prisma no representa en schema.prisma.
 *
 * Las migraciones versionadas son la fuente para despliegue. Este helper existe
 * para entornos local/test que usan `prisma db push`, que no aplica SQL manual
 * de migraciones.
 */

const SQL_CHECKS_SUSCRIPCIONES = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'suscripciones_cantidad_maxima_usuarios_positiva_check'
  ) THEN
    ALTER TABLE "suscripciones"
    ADD CONSTRAINT "suscripciones_cantidad_maxima_usuarios_positiva_check"
    CHECK ("cantidad_maxima_usuarios" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'suscripciones_fecha_fin_posterior_fecha_inicio_check'
  ) THEN
    ALTER TABLE "suscripciones"
    ADD CONSTRAINT "suscripciones_fecha_fin_posterior_fecha_inicio_check"
    CHECK ("fecha_fin" > "fecha_inicio");
  END IF;
END $$;
`;

async function aplicarChecksPrisma(prisma) {
  await prisma.$executeRawUnsafe(SQL_CHECKS_SUSCRIPCIONES);
}

async function ejecutarComoCli() {
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://normativo:normativo@localhost:5432/normativo?schema=public';

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  try {
    await prisma.$connect();
    await aplicarChecksPrisma(prisma);
    // eslint-disable-next-line no-console
    console.log('Constraints CHECK de Prisma aplicados (idempotente).');
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { aplicarChecksPrisma, SQL_CHECKS_SUSCRIPCIONES };

if (require.main === module) {
  ejecutarComoCli().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Fallo al aplicar constraints CHECK de Prisma:', error);
    process.exitCode = 1;
  });
}

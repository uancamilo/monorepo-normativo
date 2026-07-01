-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuarioPrisma" AS ENUM ('SUPERADMINISTRADOR', 'ADMINISTRADOR', 'EDITOR', 'SUSCRIPTOR');

-- CreateEnum
CREATE TYPE "EstadoSuscripcionPrisma" AS ENUM ('ACTIVA', 'INACTIVA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoNormaPrisma" AS ENUM ('VIGENTE', 'REFORMADA', 'DEROGADA');

-- CreateEnum
CREATE TYPE "EstadoEditorialNormaPrisma" AS ENUM ('BORRADOR', 'EN_REVISION', 'PUBLICADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo_normalizado" TEXT NOT NULL,
    "rol" "RolUsuarioPrisma" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suscripciones" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "cantidad_maxima_usuarios" INTEGER NOT NULL,
    "estado" "EstadoSuscripcionPrisma" NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suscripcion_correos_habilitados" (
    "id" TEXT NOT NULL,
    "suscripcion_id" TEXT NOT NULL,
    "correo_normalizado" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_correos_habilitados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normas" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo_norma" TEXT NOT NULL,
    "institucion_expide" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "estado_juridico" "EstadoNormaPrisma" NOT NULL,
    "estado_editorial" "EstadoEditorialNormaPrisma" NOT NULL,
    "fecha_expedicion" TIMESTAMP(3) NOT NULL,
    "fecha_publicacion_oficial" TIMESTAMP(3) NOT NULL,
    "fecha_publicacion_en_sistema" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_normas_publicadas" (
    "id" TEXT NOT NULL,
    "norma_id" TEXT NOT NULL,
    "fecha_publicacion_en_sistema" TIMESTAMP(3) NOT NULL,
    "tiene_contenido_completo" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_normas_publicadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_normalizado_key" ON "usuarios"("correo_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_correos_habilitados_correo_normalizado_key" ON "suscripcion_correos_habilitados"("correo_normalizado");

-- CreateIndex
CREATE INDEX "suscripcion_correos_habilitados_suscripcion_id_idx" ON "suscripcion_correos_habilitados"("suscripcion_id");

-- CreateIndex
CREATE INDEX "eventos_normas_publicadas_norma_id_idx" ON "eventos_normas_publicadas"("norma_id");

-- AddForeignKey
ALTER TABLE "suscripcion_correos_habilitados" ADD CONSTRAINT "suscripcion_correos_habilitados_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

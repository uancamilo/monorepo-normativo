-- Refactor Fase 5A: la fuente (URL del PDF oficial) pertenece a la edición
-- del Registro Oficial, no a cada norma. Esta migración crea la estructura
-- nueva, pero conserva todas las columnas históricas: el backfill y los DROP
-- se ejecutan atómicamente en 20260712000000_migrar_fuentes_a_ediciones.

BEGIN;

-- CreateEnum
CREATE TYPE "EstadoResolucionFuentePrisma" AS ENUM ('PENDIENTE', 'RESUELTA', 'CONFLICTIVA', 'NO_ENCONTRADA', 'MANUAL');

-- CreateTable
CREATE TABLE "ediciones_registro_oficial" (
    "id" TEXT NOT NULL,
    "tipo_publicacion_registro_oficial" TEXT NOT NULL,
    "numero_publicacion_registro_oficial" INTEGER NOT NULL,
    -- Día jurídico de publicación: no representa hora ni zona horaria.
    "fecha_publicacion_oficial" DATE NOT NULL,
    "url_pdf" TEXT,
    "estado_resolucion_fuente" "EstadoResolucionFuentePrisma" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ediciones_registro_oficial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: clave lógica de la edición (tipo + número + fecha).
CREATE UNIQUE INDEX "ediciones_registro_oficial_clave_logica_key" ON "ediciones_registro_oficial"("tipo_publicacion_registro_oficial", "numero_publicacion_registro_oficial", "fecha_publicacion_oficial");

-- CreateIndex
CREATE INDEX "ediciones_registro_oficial_estado_resolucion_fuente_idx" ON "ediciones_registro_oficial"("estado_resolucion_fuente");

-- AlterTable: contenido estructurado como array (el texto existente se
-- conserva como único elemento; el vacío queda como array vacío).
ALTER TABLE "normas" ALTER COLUMN "contenido" TYPE TEXT[] USING (
    CASE
        WHEN "contenido" IS NULL OR btrim("contenido") = '' THEN ARRAY[]::TEXT[]
        ELSE ARRAY["contenido"]
    END
);
ALTER TABLE "normas" ALTER COLUMN "contenido" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable: asociación de la norma con su edición del Registro Oficial.
ALTER TABLE "normas" ADD COLUMN "edicion_registro_oficial_id" TEXT;

-- CreateIndex
CREATE INDEX "normas_edicion_registro_oficial_id_idx" ON "normas"("edicion_registro_oficial_id");

-- AddForeignKey
ALTER TABLE "normas" ADD CONSTRAINT "normas_edicion_registro_oficial_id_fkey" FOREIGN KEY ("edicion_registro_oficial_id") REFERENCES "ediciones_registro_oficial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Relación explícita de ediciones de cambio. La edición principal permanece
-- en normas.edicion_registro_oficial_id; esta tabla nunca contiene la
-- principal y permite que una edición sea cambio para varias normas.
CREATE TABLE "normas_ediciones_registro_oficial_cambios" (
    "norma_id" TEXT NOT NULL,
    "edicion_registro_oficial_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normas_ediciones_registro_oficial_cambios_pkey"
      PRIMARY KEY ("norma_id", "edicion_registro_oficial_id")
);

CREATE INDEX "normas_ediciones_cambio_edicion_id_idx"
  ON "normas_ediciones_registro_oficial_cambios"("edicion_registro_oficial_id");

ALTER TABLE "normas_ediciones_registro_oficial_cambios"
  ADD CONSTRAINT "normas_ediciones_cambio_norma_id_fkey"
  FOREIGN KEY ("norma_id") REFERENCES "normas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "normas_ediciones_registro_oficial_cambios"
  ADD CONSTRAINT "normas_ediciones_cambio_edicion_id_fkey"
  FOREIGN KEY ("edicion_registro_oficial_id")
  REFERENCES "ediciones_registro_oficial"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las columnas legacy de Norma y EntradaDetectada se conservan hasta que la
-- migración siguiente haya terminado el backfill y sus comprobaciones.

COMMIT;

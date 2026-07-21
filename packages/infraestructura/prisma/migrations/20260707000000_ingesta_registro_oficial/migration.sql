-- AlterTable: los campos jurídicos/editoriales de la norma pueden estar
-- vacíos o nulos en BORRADOR; la obligatoriedad se exige al publicar.
ALTER TABLE "normas" ALTER COLUMN "fuente" DROP NOT NULL;
ALTER TABLE "normas" ALTER COLUMN "estado_juridico" DROP NOT NULL;
ALTER TABLE "normas" ALTER COLUMN "fecha_expedicion" DROP NOT NULL;
ALTER TABLE "normas" ALTER COLUMN "fecha_publicacion_oficial" DROP NOT NULL;

-- AlterTable: datos de publicación en el Registro Oficial de la norma.
ALTER TABLE "normas" ADD COLUMN "tipo_publicacion_registro_oficial" TEXT NOT NULL DEFAULT '';
ALTER TABLE "normas" ADD COLUMN "numero_publicacion_registro_oficial" INTEGER;
ALTER TABLE "normas" ADD COLUMN "fecha_publicacion_registro_oficial_cruda" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "normas_estado_editorial_idx" ON "normas"("estado_editorial");

-- CreateTable
CREATE TABLE "lotes_ingesta_registro_oficial" (
    "id" TEXT NOT NULL,
    "huella_lote" TEXT NOT NULL,
    "periodo_anio" INTEGER NOT NULL,
    "periodo_mes" INTEGER NOT NULL,
    "fecha_ejecucion" TIMESTAMP(3) NOT NULL,
    "url_resumen_mensual_registro_oficial" TEXT NOT NULL,
    "version_extractor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_ingesta_registro_oficial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_detectadas_registro_oficial" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "posicion" INTEGER NOT NULL,
    "norma_id" TEXT NOT NULL,
    "segmento_crudo" TEXT NOT NULL,
    "metadata_extraccion" JSONB NOT NULL,
    "tipo_detectado" TEXT,
    "numero_detectado" TEXT,
    "titulo_detectado" TEXT,
    "institucion_detectada" TEXT,
    "url_fuente" TEXT,
    "seccion" TEXT,
    "publicacion_tipo" TEXT,
    "publicacion_numero" INTEGER,
    "publicacion_fecha_cruda" TEXT,
    "publicacion_fecha" TIMESTAMP(3),
    "advertencias" JSONB NOT NULL,
    "confianza" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_detectadas_registro_oficial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lotes_ingesta_registro_oficial_periodo_anio_periodo_mes_key" ON "lotes_ingesta_registro_oficial"("periodo_anio", "periodo_mes");

-- CreateIndex
CREATE UNIQUE INDEX "entradas_detectadas_registro_oficial_lote_id_posicion_key" ON "entradas_detectadas_registro_oficial"("lote_id", "posicion");

-- CreateIndex
CREATE INDEX "entradas_detectadas_registro_oficial_norma_id_idx" ON "entradas_detectadas_registro_oficial"("norma_id");

-- AddForeignKey
ALTER TABLE "entradas_detectadas_registro_oficial" ADD CONSTRAINT "entradas_detectadas_registro_oficial_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_ingesta_registro_oficial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_detectadas_registro_oficial" ADD CONSTRAINT "entradas_detectadas_registro_oficial_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "normas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

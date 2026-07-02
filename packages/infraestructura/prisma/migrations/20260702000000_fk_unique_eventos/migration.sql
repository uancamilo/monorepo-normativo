-- DropIndex
DROP INDEX "eventos_normas_publicadas_norma_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "eventos_normas_publicadas_norma_id_key" ON "eventos_normas_publicadas"("norma_id");

-- AddForeignKey
ALTER TABLE "eventos_normas_publicadas" ADD CONSTRAINT "eventos_normas_publicadas_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "normas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

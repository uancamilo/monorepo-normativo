-- Fase 5A: migración atómica de la triple y la fuente históricas de Norma a
-- EdicionRegistroOficial. Las columnas legacy solo se eliminan después de
-- completar y validar el backfill.

BEGIN;

-- Preflight: la entidad nueva no admite números no positivos y ninguna fuente
-- de Norma o EntradaDetectada puede eliminarse si su Norma carece de triple.
-- Estas comprobaciones ocurren antes de crear ediciones o eliminar columnas.
DO $preflight_fase_5a$
DECLARE
    "cantidad_numeros_invalidos" INTEGER;
    "cantidad_fuentes_sin_triple" INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO "cantidad_numeros_invalidos"
    FROM "normas"
    WHERE "numero_publicacion_registro_oficial" IS NOT NULL
      AND "numero_publicacion_registro_oficial" <= 0;

    IF "cantidad_numeros_invalidos" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % valor(es) de numero_publicacion_registro_oficial deben ser mayores que cero.',
            "cantidad_numeros_invalidos";
    END IF;

    SELECT (
        SELECT COUNT(*)::INTEGER
        FROM "normas" n
        WHERE NULLIF(btrim(n."fuente"), '') IS NOT NULL
          AND (
              NULLIF(btrim(n."tipo_publicacion_registro_oficial"), '') IS NULL
              OR n."numero_publicacion_registro_oficial" IS NULL
              OR n."fecha_publicacion_oficial" IS NULL
          )
    ) + (
        SELECT COUNT(*)::INTEGER
        FROM "entradas_detectadas_registro_oficial" entrada
        JOIN "normas" n ON n."id" = entrada."norma_id"
        WHERE NULLIF(btrim(entrada."url_fuente"), '') IS NOT NULL
          AND (
              NULLIF(btrim(n."tipo_publicacion_registro_oficial"), '') IS NULL
              OR n."numero_publicacion_registro_oficial" IS NULL
              OR n."fecha_publicacion_oficial" IS NULL
          )
    )
    INTO "cantidad_fuentes_sin_triple";

    IF "cantidad_fuentes_sin_triple" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % fuente(s) histórica(s) de Norma o EntradaDetectada tienen triple incompleta; no se eliminará información.',
            "cantidad_fuentes_sin_triple";
    END IF;
END
$preflight_fase_5a$;

-- Una fila por Norma cuya triple histórica está completa. Se normalizan tipo
-- y fecha calendario antes de agrupar; las fuentes se recopilan por separado.
CREATE TEMP TABLE "migracion_normas_ediciones" (
    "norma_id" TEXT NOT NULL,
    "tipo_publicacion" TEXT NOT NULL,
    "numero_publicacion" INTEGER NOT NULL,
    "fecha_publicacion" DATE NOT NULL,
    "edicion_id" TEXT
) ON COMMIT DROP;

INSERT INTO "migracion_normas_ediciones" (
    "norma_id",
    "tipo_publicacion",
    "numero_publicacion",
    "fecha_publicacion"
)
SELECT
    n."id",
    btrim(n."tipo_publicacion_registro_oficial"),
    n."numero_publicacion_registro_oficial",
    n."fecha_publicacion_oficial"::date
FROM "normas" n
WHERE NULLIF(btrim(n."tipo_publicacion_registro_oficial"), '') IS NOT NULL
  AND n."numero_publicacion_registro_oficial" IS NOT NULL
  AND n."fecha_publicacion_oficial" IS NOT NULL;

-- Fuentes candidatas de ambas ubicaciones históricas. Las URL de entradas se
-- asocian mediante su Norma y, por tanto, usan exactamente su triple canónica.
CREATE TEMP TABLE "migracion_fuentes_ediciones" (
    "norma_id" TEXT NOT NULL,
    "tipo_publicacion" TEXT NOT NULL,
    "numero_publicacion" INTEGER NOT NULL,
    "fecha_publicacion" DATE NOT NULL,
    "fuente_url" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "migracion_fuentes_ediciones" (
    "norma_id",
    "tipo_publicacion",
    "numero_publicacion",
    "fecha_publicacion",
    "fuente_url"
)
SELECT
    m."norma_id",
    m."tipo_publicacion",
    m."numero_publicacion",
    m."fecha_publicacion",
    NULLIF(btrim(n."fuente"), '')
FROM "migracion_normas_ediciones" m
JOIN "normas" n ON n."id" = m."norma_id"
WHERE NULLIF(btrim(n."fuente"), '') IS NOT NULL
UNION ALL
SELECT
    m."norma_id",
    m."tipo_publicacion",
    m."numero_publicacion",
    m."fecha_publicacion",
    NULLIF(btrim(entrada."url_fuente"), '')
FROM "migracion_normas_ediciones" m
JOIN "entradas_detectadas_registro_oficial" entrada
  ON entrada."norma_id" = m."norma_id"
WHERE NULLIF(btrim(entrada."url_fuente"), '') IS NOT NULL;

-- Una fila por triple normalizada. COUNT(DISTINCT ...) evita el MAX(boolean)
-- inválido y permite distinguir sin fuente, fuente única y conflicto.
CREATE TEMP TABLE "migracion_ediciones_agrupadas" (
    "tipo_publicacion" TEXT NOT NULL,
    "numero_publicacion" INTEGER NOT NULL,
    "fecha_publicacion" DATE NOT NULL,
    "cantidad_fuentes" INTEGER NOT NULL,
    "fuente_unica" TEXT
) ON COMMIT DROP;

INSERT INTO "migracion_ediciones_agrupadas" (
    "tipo_publicacion",
    "numero_publicacion",
    "fecha_publicacion",
    "cantidad_fuentes",
    "fuente_unica"
)
SELECT
    m."tipo_publicacion",
    m."numero_publicacion",
    m."fecha_publicacion",
    COUNT(DISTINCT f."fuente_url") FILTER (
        WHERE f."fuente_url" IS NOT NULL
    )::INTEGER,
    MIN(f."fuente_url") FILTER (WHERE f."fuente_url" IS NOT NULL)
FROM "migracion_normas_ediciones" m
LEFT JOIN "migracion_fuentes_ediciones" f
  ON f."norma_id" = m."norma_id"
GROUP BY
    m."tipo_publicacion",
    m."numero_publicacion",
    m."fecha_publicacion";

-- Preflight de fuentes conflictivas: una triple histórica con más de una URL
-- distinta no puede resolverse sin descartar información. En ese caso la
-- migración aborta y la transacción revierte; el operador debe dejar una única
-- URL en los datos legacy antes de reintentar. La migración nunca elige una URL
-- arbitrariamente ni borra URLs conflictivas. El estado CONFLICTIVA sigue siendo
-- válido en runtime para la resolución automática futura, pero no se usa aquí
-- como mecanismo para perder fuentes históricas.
DO $conflicto_fuentes_fase_5a$
DECLARE
    "cantidad_triples_conflictivas" INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO "cantidad_triples_conflictivas"
    FROM "migracion_ediciones_agrupadas"
    WHERE "cantidad_fuentes" > 1;

    IF "cantidad_triples_conflictivas" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % triple(s) histórica(s) tienen múltiples fuentes distintas; resuelva los conflictos antes de migrar.',
            "cantidad_triples_conflictivas";
    END IF;
END
$conflicto_fuentes_fase_5a$;

-- La tabla acaba de ser creada en la migración anterior. ON CONFLICT permite
-- reusar de forma segura una edición que ya exista por la misma clave lógica,
-- sin sobrescribir su URL ni su estado. Tras el preflight anterior, el backfill
-- histórico solo contempla dos caminos: sin fuente (PENDIENTE) y fuente única
-- (RESUELTA).
INSERT INTO "ediciones_registro_oficial" (
    "id",
    "tipo_publicacion_registro_oficial",
    "numero_publicacion_registro_oficial",
    "fecha_publicacion_oficial",
    "url_pdf",
    "estado_resolucion_fuente",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::TEXT,
    g."tipo_publicacion",
    g."numero_publicacion",
    g."fecha_publicacion",
    CASE
        WHEN g."cantidad_fuentes" = 1 THEN g."fuente_unica"
        ELSE NULL
    END,
    (CASE
        WHEN g."cantidad_fuentes" = 1 THEN 'RESUELTA'
        ELSE 'PENDIENTE'
    END)::"EstadoResolucionFuentePrisma",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "migracion_ediciones_agrupadas" g
ON CONFLICT (
    "tipo_publicacion_registro_oficial",
    "numero_publicacion_registro_oficial",
    "fecha_publicacion_oficial"
) DO NOTHING;

UPDATE "migracion_normas_ediciones" m
SET "edicion_id" = e."id"
FROM "ediciones_registro_oficial" e
WHERE e."tipo_publicacion_registro_oficial" = m."tipo_publicacion"
  AND e."numero_publicacion_registro_oficial" = m."numero_publicacion"
  AND e."fecha_publicacion_oficial" = m."fecha_publicacion";

UPDATE "normas" n
SET "edicion_registro_oficial_id" = m."edicion_id"
FROM "migracion_normas_ediciones" m
WHERE n."id" = m."norma_id"
  AND m."edicion_id" IS NOT NULL;

-- Antes de cualquier DROP se comprueba que cada triple completa fue asociada,
-- que los estados/URLs preservan exactamente las fuentes históricas y que no
-- queda ninguna Norma PUBLICADA sin edición.
DO $migracion_fase_5a$
DECLARE
    "cantidad_triples_sin_edicion" INTEGER;
    "cantidad_ediciones_inconsistentes" INTEGER;
    "cantidad_normas_sin_asociar" INTEGER;
    "cantidad_publicadas_sin_edicion" INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO "cantidad_triples_sin_edicion"
    FROM "migracion_ediciones_agrupadas" g
    LEFT JOIN "ediciones_registro_oficial" e
      ON e."tipo_publicacion_registro_oficial" = g."tipo_publicacion"
     AND e."numero_publicacion_registro_oficial" = g."numero_publicacion"
     AND e."fecha_publicacion_oficial" = g."fecha_publicacion"
    WHERE e."id" IS NULL;

    IF "cantidad_triples_sin_edicion" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % triple(s) completa(s) no produjeron una edición.',
            "cantidad_triples_sin_edicion";
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO "cantidad_ediciones_inconsistentes"
    FROM "migracion_ediciones_agrupadas" g
    JOIN "ediciones_registro_oficial" e
      ON e."tipo_publicacion_registro_oficial" = g."tipo_publicacion"
     AND e."numero_publicacion_registro_oficial" = g."numero_publicacion"
     AND e."fecha_publicacion_oficial" = g."fecha_publicacion"
    WHERE
        (g."cantidad_fuentes" = 1 AND (
            e."estado_resolucion_fuente" <> 'RESUELTA'::"EstadoResolucionFuentePrisma"
            OR e."url_pdf" IS DISTINCT FROM g."fuente_unica"
        ))
        OR (g."cantidad_fuentes" = 0 AND (
            e."estado_resolucion_fuente" <> 'PENDIENTE'::"EstadoResolucionFuentePrisma"
            OR e."url_pdf" IS NOT NULL
        ));

    IF "cantidad_ediciones_inconsistentes" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % edición(es) no preservan las fuentes históricas.',
            "cantidad_ediciones_inconsistentes";
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO "cantidad_normas_sin_asociar"
    FROM "migracion_normas_ediciones" m
    JOIN "normas" n ON n."id" = m."norma_id"
    WHERE m."edicion_id" IS NULL
       OR n."edicion_registro_oficial_id" IS DISTINCT FROM m."edicion_id";

    IF "cantidad_normas_sin_asociar" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % norma(s) con triple completa no quedaron asociadas.',
            "cantidad_normas_sin_asociar";
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO "cantidad_publicadas_sin_edicion"
    FROM "normas"
    WHERE "estado_editorial" = 'PUBLICADA'::"EstadoEditorialNormaPrisma"
      AND "edicion_registro_oficial_id" IS NULL;

    IF "cantidad_publicadas_sin_edicion" > 0 THEN
        RAISE EXCEPTION
            'INTEGRIDAD FASE 5A: % norma(s) PUBLICADA(S) sin edición; se conservan las columnas históricas.',
            "cantidad_publicadas_sin_edicion";
    END IF;

END
$migracion_fase_5a$;

-- Solo después de superar todas las comprobaciones se eliminan los datos
-- legacy. La transacción garantiza rollback atómico de datos y esquema ante
-- cualquier fallo; Prisma Migrate puede requerir marcar la ejecución fallida
-- como rolled back antes de reintentar el deploy.
ALTER TABLE "normas"
    DROP COLUMN "fuente",
    DROP COLUMN "tipo_publicacion_registro_oficial",
    DROP COLUMN "numero_publicacion_registro_oficial",
    DROP COLUMN "fecha_publicacion_oficial",
    DROP COLUMN "fecha_publicacion_registro_oficial_cruda";

ALTER TABLE "entradas_detectadas_registro_oficial"
    DROP COLUMN "url_fuente",
    DROP COLUMN "publicacion_fecha_cruda";

COMMIT;

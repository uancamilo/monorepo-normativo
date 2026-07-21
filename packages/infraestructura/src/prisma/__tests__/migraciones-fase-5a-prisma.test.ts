import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { obtenerTestDatabaseUrlDesdeEntorno } from '../validar-url-base-datos-test';

const testDatabaseUrl = obtenerTestDatabaseUrlDesdeEntorno();
const describirPrisma = testDatabaseUrl ? describe : describe.skip;

const directorioMigraciones = resolve(__dirname, '../../../prisma/migrations');
const migracionesPreviasFase5A = [
  '20260630000000_inicial',
  '20260701000000_checks_suscripciones',
  '20260702000000_fk_unique_eventos',
  '20260706000000_agregar_password_hash_usuarios',
  '20260707000000_ingesta_registro_oficial',
] as const;
const migracionEstructuraFase5A = '20260710000000_ediciones_registro_oficial';
const migracionDatosFase5A = '20260712000000_migrar_fuentes_a_ediciones';

interface NormaHistorica {
  id: string;
  estadoEditorial?: 'BORRADOR' | 'PUBLICADA';
  contenido?: string;
  fuente: string | null;
  tipoPublicacion: string;
  numeroPublicacion: number | null;
  fechaPublicacion: string | null;
}

interface EntradaHistorica {
  id: string;
  normaId: string;
  urlFuente: string | null;
}

describirPrisma('Migración histórica Fase 5A (Prisma/PostgreSQL)', () => {
  it('preserva fuentes, reutiliza triples normalizadas y elimina legacy solo al finalizar', async () => {
    await conSchemaAislado(async (cliente, schema) => {
      await aplicarMigraciones(cliente, migracionesPreviasFase5A);

      await insertarNormasHistoricas(cliente, [
        {
          id: 'misma-triple-1',
          estadoEditorial: 'PUBLICADA',
          fuente: ' https://registro.test/ro-101.pdf ',
          tipoPublicacion: ' RO ',
          numeroPublicacion: 101,
          fechaPublicacion: '2026-01-10T08:30:00.000Z',
        },
        {
          id: 'misma-triple-2',
          contenido: '',
          fuente: 'https://registro.test/ro-101.pdf',
          tipoPublicacion: 'RO',
          numeroPublicacion: 101,
          fechaPublicacion: '2026-01-10T18:45:00.000Z',
        },
        {
          id: 'triple-sin-fuente',
          fuente: null,
          tipoPublicacion: 'RO',
          numeroPublicacion: 103,
          fechaPublicacion: '2026-01-12T05:00:00.000Z',
        },
        {
          id: 'fuente-solo-entrada',
          fuente: null,
          tipoPublicacion: 'RO',
          numeroPublicacion: 104,
          fechaPublicacion: '2026-01-14T09:00:00.000Z',
        },
        {
          id: 'triple-incompleta',
          fuente: null,
          tipoPublicacion: 'RO',
          numeroPublicacion: null,
          fechaPublicacion: '2026-01-13T00:00:00.000Z',
        },
      ]);
      await insertarEntradasHistoricas(cliente, [
        {
          id: 'entrada-fuente-unica',
          normaId: 'fuente-solo-entrada',
          urlFuente: ' https://registro.test/ro-104.pdf ',
        },
      ]);

      await aplicarMigraciones(cliente, [
        migracionEstructuraFase5A,
        migracionDatosFase5A,
      ]);

      const tipoFecha = await cliente.query<{ data_type: string }>(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = '${schema}'
          AND table_name = 'ediciones_registro_oficial'
          AND column_name = 'fecha_publicacion_oficial'
      `);
      expect(tipoFecha.rows).toEqual([{ data_type: 'date' }]);

      const estructuraCambios = await cliente.query<{
        tabla: string | null;
        indice_edicion: string | null;
        cantidad_fk: number;
      }>(`
        SELECT
          to_regclass('${schema}.normas_ediciones_registro_oficial_cambios')::text AS "tabla",
          to_regclass('${schema}.normas_ediciones_cambio_edicion_id_idx')::text AS "indice_edicion",
          (
            SELECT COUNT(*)::INTEGER
            FROM information_schema.table_constraints
            WHERE table_schema = '${schema}'
              AND table_name = 'normas_ediciones_registro_oficial_cambios'
              AND constraint_type = 'FOREIGN KEY'
          ) AS "cantidad_fk"
      `);
      expect(estructuraCambios.rows[0]?.tabla).toBe(
        'normas_ediciones_registro_oficial_cambios',
      );
      expect(estructuraCambios.rows[0]?.indice_edicion).toBe(
        'normas_ediciones_cambio_edicion_id_idx',
      );
      expect(estructuraCambios.rows[0]?.cantidad_fk).toBe(2);

      const ediciones = await cliente.query<{
        tipo: string;
        numero: number;
        fecha: string;
        url_pdf: string | null;
        estado: string;
      }>(`
        SELECT
          "tipo_publicacion_registro_oficial" AS "tipo",
          "numero_publicacion_registro_oficial" AS "numero",
          "fecha_publicacion_oficial"::date::text AS "fecha",
          "url_pdf",
          "estado_resolucion_fuente"::text AS "estado"
        FROM "ediciones_registro_oficial"
        ORDER BY "numero_publicacion_registro_oficial"
      `);

      expect(ediciones.rows).toEqual([
        {
          tipo: 'RO',
          numero: 101,
          fecha: '2026-01-10',
          url_pdf: 'https://registro.test/ro-101.pdf',
          estado: 'RESUELTA',
        },
        {
          tipo: 'RO',
          numero: 103,
          fecha: '2026-01-12',
          url_pdf: null,
          estado: 'PENDIENTE',
        },
        {
          tipo: 'RO',
          numero: 104,
          fecha: '2026-01-14',
          url_pdf: 'https://registro.test/ro-104.pdf',
          estado: 'RESUELTA',
        },
      ]);

      const asociaciones = await cliente.query<{
        id: string;
        edicion_id: string | null;
      }>(`
        SELECT "id", "edicion_registro_oficial_id" AS "edicion_id"
        FROM "normas"
        ORDER BY "id"
      `);
      const porId = new Map(asociaciones.rows.map((fila) => [fila.id, fila]));

      expect(porId.get('misma-triple-1')?.edicion_id).toBeTruthy();
      expect(porId.get('misma-triple-2')?.edicion_id).toBe(
        porId.get('misma-triple-1')?.edicion_id,
      );
      expect(porId.get('triple-sin-fuente')?.edicion_id).toBeTruthy();
      expect(porId.get('fuente-solo-entrada')?.edicion_id).toBeTruthy();
      expect(porId.get('triple-incompleta')?.edicion_id).toBeNull();

      await esperarColumnasAusentes(cliente, schema, 'normas', [
        'fuente',
        'tipo_publicacion_registro_oficial',
        'numero_publicacion_registro_oficial',
        'fecha_publicacion_oficial',
        'fecha_publicacion_registro_oficial_cruda',
      ]);
      await esperarColumnasAusentes(
        cliente,
        schema,
        'entradas_detectadas_registro_oficial',
        ['anio_detectado', 'url_fuente', 'publicacion_fecha_cruda'],
      );

      const contenidos = await cliente.query<{ id: string; contenido: string[] }>(`
        SELECT "id", "contenido"
        FROM "normas"
        WHERE "id" IN ('misma-triple-1', 'misma-triple-2')
        ORDER BY "id"
      `);
      expect(contenidos.rows).toEqual([
        { id: 'misma-triple-1', contenido: ['Contenido histórico'] },
        { id: 'misma-triple-2', contenido: [] },
      ]);
    });
  });

  it('aborta y conserva las URLs históricas si una triple tiene varias fuentes distintas, y permite reintentar tras resolver el conflicto', async () => {
    await conSchemaAislado(async (cliente, schema) => {
      await aplicarMigraciones(cliente, migracionesPreviasFase5A);

      // Misma triple normalizada RO/500/2026-05-02 con dos URLs distintas: una
      // proviene de Norma.fuente y otra de EntradaDetectada.url_fuente.
      await insertarNormasHistoricas(cliente, [
        {
          id: 'conflicto-por-norma',
          fuente: ' https://registro.test/ro-500-a.pdf ',
          tipoPublicacion: 'RO',
          numeroPublicacion: 500,
          fechaPublicacion: '2026-05-02T08:00:00.000Z',
        },
        {
          id: 'conflicto-por-entrada',
          fuente: null,
          tipoPublicacion: ' RO ',
          numeroPublicacion: 500,
          fechaPublicacion: '2026-05-02T20:00:00.000Z',
        },
      ]);
      await insertarEntradasHistoricas(cliente, [
        {
          id: 'entrada-conflicto',
          normaId: 'conflicto-por-entrada',
          urlFuente: 'https://registro.test/ro-500-b.pdf',
        },
      ]);
      await aplicarMigraciones(cliente, [migracionEstructuraFase5A]);

      await expect(
        aplicarMigraciones(cliente, [migracionDatosFase5A]),
      ).rejects.toThrow(/múltiples fuentes distintas/);
      await cliente.query('ROLLBACK');

      // Rollback atómico: ninguna edición parcial y sin asociar normas.
      const estadoTrasFallo = await cliente.query<{
        cantidad_ediciones: number;
        cantidad_asociadas: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM "ediciones_registro_oficial") AS "cantidad_ediciones",
          (SELECT COUNT(*)::INTEGER FROM "normas" WHERE "edicion_registro_oficial_id" IS NOT NULL) AS "cantidad_asociadas"
      `);
      expect(estadoTrasFallo.rows[0]).toEqual({
        cantidad_ediciones: 0,
        cantidad_asociadas: 0,
      });

      // Las columnas legacy y todas las URLs conflictivas permanecen intactas.
      await esperarColumnasPresentes(cliente, schema, 'normas', [
        'fuente',
        'tipo_publicacion_registro_oficial',
        'numero_publicacion_registro_oficial',
        'fecha_publicacion_oficial',
        'fecha_publicacion_registro_oficial_cruda',
      ]);
      await esperarColumnasPresentes(
        cliente,
        schema,
        'entradas_detectadas_registro_oficial',
        ['url_fuente', 'publicacion_fecha_cruda'],
      );

      const fuenteNorma = await cliente.query<{ fuente: string | null }>(`
        SELECT "fuente"
        FROM "normas"
        WHERE "id" = 'conflicto-por-norma'
      `);
      expect(fuenteNorma.rows[0]?.fuente).toBe(
        ' https://registro.test/ro-500-a.pdf ',
      );

      const fuenteEntrada = await cliente.query<{ url_fuente: string | null }>(`
        SELECT "url_fuente"
        FROM "entradas_detectadas_registro_oficial"
        WHERE "id" = 'entrada-conflicto'
      `);
      expect(fuenteEntrada.rows[0]?.url_fuente).toBe(
        'https://registro.test/ro-500-b.pdf',
      );

      // El operador resuelve el conflicto dejando una única URL en los datos
      // legacy y reintenta: ahora migra correctamente a RESUELTA.
      await cliente.query(`
        UPDATE "entradas_detectadas_registro_oficial"
        SET "url_fuente" = 'https://registro.test/ro-500-a.pdf'
        WHERE "id" = 'entrada-conflicto'
      `);

      await aplicarMigraciones(cliente, [migracionDatosFase5A]);

      const reintento = await cliente.query<{
        tipo: string;
        numero: number;
        fecha: string;
        url_pdf: string | null;
        estado: string;
      }>(`
        SELECT
          "tipo_publicacion_registro_oficial" AS "tipo",
          "numero_publicacion_registro_oficial" AS "numero",
          "fecha_publicacion_oficial"::date::text AS "fecha",
          "url_pdf",
          "estado_resolucion_fuente"::text AS "estado"
        FROM "ediciones_registro_oficial"
      `);
      expect(reintento.rows).toEqual([
        {
          tipo: 'RO',
          numero: 500,
          fecha: '2026-05-02',
          url_pdf: 'https://registro.test/ro-500-a.pdf',
          estado: 'RESUELTA',
        },
      ]);

      const asociadas = await cliente.query<{
        id: string;
        edicion_id: string | null;
      }>(`
        SELECT "id", "edicion_registro_oficial_id" AS "edicion_id"
        FROM "normas"
        WHERE "id" IN ('conflicto-por-norma', 'conflicto-por-entrada')
        ORDER BY "id"
      `);
      const idEdicion = asociadas.rows[0]?.edicion_id;
      expect(idEdicion).toBeTruthy();
      expect(asociadas.rows[1]?.edicion_id).toBe(idEdicion);

      // El legacy se elimina únicamente en el reintento exitoso.
      await esperarColumnasAusentes(cliente, schema, 'normas', [
        'fuente',
        'tipo_publicacion_registro_oficial',
        'numero_publicacion_registro_oficial',
        'fecha_publicacion_oficial',
        'fecha_publicacion_registro_oficial_cruda',
      ]);
      await esperarColumnasAusentes(
        cliente,
        schema,
        'entradas_detectadas_registro_oficial',
        ['url_fuente', 'publicacion_fecha_cruda'],
      );
    });
  });

  it('aborta atómicamente si una PUBLICADA no produce edición y permite reintentar', async () => {
    await conSchemaAislado(async (cliente, schema) => {
      await aplicarMigraciones(cliente, migracionesPreviasFase5A);
      await insertarNormasHistoricas(cliente, [
        {
          id: 'publicada-sin-triple',
          estadoEditorial: 'PUBLICADA',
          fuente: null,
          tipoPublicacion: '',
          numeroPublicacion: null,
          fechaPublicacion: null,
        },
      ]);
      await aplicarMigraciones(cliente, [migracionEstructuraFase5A]);

      await expect(
        aplicarMigraciones(cliente, [migracionDatosFase5A]),
      ).rejects.toThrow(/PUBLICADA\(S\) sin edición/);
      await cliente.query('ROLLBACK');

      await esperarColumnasPresentes(cliente, schema, 'normas', [
        'fuente',
        'tipo_publicacion_registro_oficial',
        'numero_publicacion_registro_oficial',
        'fecha_publicacion_oficial',
        'fecha_publicacion_registro_oficial_cruda',
      ]);
      await esperarColumnasPresentes(
        cliente,
        schema,
        'entradas_detectadas_registro_oficial',
        ['url_fuente', 'publicacion_fecha_cruda'],
      );

      const estadoTrasFallo = await cliente.query<{
        cantidad_ediciones: number;
        edicion_id: string | null;
      }>(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM "ediciones_registro_oficial") AS "cantidad_ediciones",
          "edicion_registro_oficial_id" AS "edicion_id"
        FROM "normas"
        WHERE "id" = 'publicada-sin-triple'
      `);
      expect(estadoTrasFallo.rows[0]).toEqual({
        cantidad_ediciones: 0,
        edicion_id: null,
      });

      await cliente.query(`
        UPDATE "normas"
        SET
          "fuente" = 'https://registro.test/ro-999.pdf',
          "tipo_publicacion_registro_oficial" = 'RO',
          "numero_publicacion_registro_oficial" = 999,
          "fecha_publicacion_oficial" = '2026-01-31T23:00:00.000Z'
        WHERE "id" = 'publicada-sin-triple'
      `);

      await aplicarMigraciones(cliente, [migracionDatosFase5A]);

      const reintento = await cliente.query<{
        estado: string;
        url_pdf: string | null;
        edicion_id: string | null;
      }>(`
        SELECT
          e."estado_resolucion_fuente"::text AS "estado",
          e."url_pdf",
          n."edicion_registro_oficial_id" AS "edicion_id"
        FROM "normas" n
        JOIN "ediciones_registro_oficial" e
          ON e."id" = n."edicion_registro_oficial_id"
        WHERE n."id" = 'publicada-sin-triple'
      `);
      expect(reintento.rows[0]).toEqual({
        estado: 'RESUELTA',
        url_pdf: 'https://registro.test/ro-999.pdf',
        edicion_id: expect.any(String),
      });
    });
  });

  it('no elimina una fuente histórica que no puede asociar por triple incompleta', async () => {
    await conSchemaAislado(async (cliente, schema) => {
      await aplicarMigraciones(cliente, migracionesPreviasFase5A);
      await insertarNormasHistoricas(cliente, [
        {
          id: 'borrador-fuente-sin-triple',
          fuente: 'https://registro.test/sin-triple.pdf',
          tipoPublicacion: 'RO',
          numeroPublicacion: null,
          fechaPublicacion: '2026-02-01T00:00:00.000Z',
        },
        {
          id: 'borrador-entrada-sin-triple',
          fuente: null,
          tipoPublicacion: 'SRO',
          numeroPublicacion: null,
          fechaPublicacion: '2026-02-02T00:00:00.000Z',
        },
      ]);
      await insertarEntradasHistoricas(cliente, [
        {
          id: 'entrada-sin-triple',
          normaId: 'borrador-entrada-sin-triple',
          urlFuente: 'https://registro.test/entrada-sin-triple.pdf',
        },
      ]);
      await aplicarMigraciones(cliente, [migracionEstructuraFase5A]);

      await expect(
        aplicarMigraciones(cliente, [migracionDatosFase5A]),
      ).rejects.toThrow(/fuente\(s\) histórica\(s\).*triple incompleta/);
      await cliente.query('ROLLBACK');

      await esperarColumnasPresentes(cliente, schema, 'normas', ['fuente']);
      const fuente = await cliente.query<{ fuente: string | null }>(`
        SELECT "fuente"
        FROM "normas"
        WHERE "id" = 'borrador-fuente-sin-triple'
      `);
      expect(fuente.rows[0]?.fuente).toBe(
        'https://registro.test/sin-triple.pdf',
      );

      const fuenteEntrada = await cliente.query<{ url_fuente: string | null }>(`
        SELECT "url_fuente"
        FROM "entradas_detectadas_registro_oficial"
        WHERE "id" = 'entrada-sin-triple'
      `);
      expect(fuenteEntrada.rows[0]?.url_fuente).toBe(
        'https://registro.test/entrada-sin-triple.pdf',
      );
    });
  });

  it('aborta antes del backfill si existe un número de publicación no positivo', async () => {
    await conSchemaAislado(async (cliente, schema) => {
      await aplicarMigraciones(cliente, migracionesPreviasFase5A);
      await insertarNormasHistoricas(cliente, [
        {
          id: 'numero-cero',
          fuente: 'https://registro.test/ro-cero.pdf',
          tipoPublicacion: 'RO',
          numeroPublicacion: 0,
          fechaPublicacion: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'numero-negativo',
          fuente: null,
          tipoPublicacion: 'SRO',
          numeroPublicacion: -1,
          fechaPublicacion: '2026-03-02T00:00:00.000Z',
        },
      ]);
      await aplicarMigraciones(cliente, [migracionEstructuraFase5A]);

      await expect(
        aplicarMigraciones(cliente, [migracionDatosFase5A]),
      ).rejects.toThrow(
        /numero_publicacion_registro_oficial deben ser mayores que cero/,
      );
      await cliente.query('ROLLBACK');

      await esperarColumnasPresentes(cliente, schema, 'normas', [
        'fuente',
        'numero_publicacion_registro_oficial',
      ]);
      const cantidadEdiciones = await cliente.query<{ cantidad: number }>(`
        SELECT COUNT(*)::INTEGER AS "cantidad"
        FROM "ediciones_registro_oficial"
      `);
      expect(cantidadEdiciones.rows[0]?.cantidad).toBe(0);
    });
  });
});

async function aplicarMigraciones(
  cliente: Client,
  migraciones: readonly string[],
): Promise<void> {
  for (const migracion of migraciones) {
    const sql = await readFile(
      resolve(directorioMigraciones, migracion, 'migration.sql'),
      'utf8',
    );
    await cliente.query(sql);
  }
}

async function insertarNormasHistoricas(
  cliente: Client,
  normas: readonly NormaHistorica[],
): Promise<void> {
  for (const norma of normas) {
    await cliente.query(
      `
        INSERT INTO "normas" (
          "id",
          "numero",
          "titulo",
          "contenido",
          "tipo_norma",
          "institucion_expide",
          "fuente",
          "estado_juridico",
          "estado_editorial",
          "fecha_expedicion",
          "fecha_publicacion_oficial",
          "fecha_publicacion_en_sistema",
          "created_at",
          "updated_at",
          "tipo_publicacion_registro_oficial",
          "numero_publicacion_registro_oficial",
          "fecha_publicacion_registro_oficial_cruda"
        ) VALUES (
          $1,
          $1,
          'Norma histórica ' || $1,
          $2,
          'RESOLUCIÓN',
          'Institución histórica',
          $3,
          'VIGENTE'::"EstadoNormaPrisma",
          $4::"EstadoEditorialNormaPrisma",
          '2026-01-01T00:00:00.000Z',
          $5,
          CASE WHEN $4 = 'PUBLICADA' THEN '2026-02-01T00:00:00.000Z'::timestamp ELSE NULL END,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          $6,
          $7,
          COALESCE($8, '')
        )
      `,
      [
        norma.id,
        norma.contenido ?? 'Contenido histórico',
        norma.fuente,
        norma.estadoEditorial ?? 'BORRADOR',
        norma.fechaPublicacion,
        norma.tipoPublicacion,
        norma.numeroPublicacion,
        norma.fechaPublicacion?.slice(0, 10) ?? null,
      ],
    );
  }
}

async function insertarEntradasHistoricas(
  cliente: Client,
  entradas: readonly EntradaHistorica[],
): Promise<void> {
  await cliente.query(`
    INSERT INTO "lotes_ingesta_registro_oficial" (
      "id",
      "huella_lote",
      "periodo_anio",
      "periodo_mes",
      "fecha_ejecucion",
      "url_resumen_mensual_registro_oficial",
      "version_extractor"
    ) VALUES (
      'lote-historico',
      'huella-lote-historico',
      2026,
      1,
      '2026-01-31T00:00:00.000Z',
      'https://registro.test/resumen-2026-01.pdf',
      'historico-v1'
    )
  `);

  for (const [indice, entrada] of entradas.entries()) {
    await cliente.query(
      `
        INSERT INTO "entradas_detectadas_registro_oficial" (
          "id",
          "lote_id",
          "posicion",
          "norma_id",
          "segmento_crudo",
          "metadata_extraccion",
          "url_fuente",
          "advertencias",
          "confianza"
        ) VALUES (
          $1,
          'lote-historico',
          $2,
          $3,
          'Segmento histórico ' || $1,
          '{}'::jsonb,
          $4,
          '[]'::jsonb,
          1
        )
      `,
      [entrada.id, indice + 1, entrada.normaId, entrada.urlFuente],
    );
  }
}

async function conSchemaAislado(
  ejecutar: (cliente: Client, schema: string) => Promise<void>,
): Promise<void> {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL es obligatoria para esta suite.');
  }

  const schema = `fase5a_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  const cliente = new Client({
    connectionString: quitarSchemaPrisma(testDatabaseUrl),
  });
  await cliente.connect();

  try {
    await cliente.query(`CREATE SCHEMA ${citarIdentificador(schema)}`);
    await cliente.query(
      `SET search_path TO ${citarIdentificador(schema)}, pg_catalog`,
    );
    await ejecutar(cliente, schema);
  } finally {
    // Un error dentro de BEGIN deja la sesión abortada hasta ROLLBACK.
    await cliente.query('ROLLBACK').catch(() => undefined);
    await cliente.query('SET search_path TO pg_catalog');
    await cliente
      .query(`DROP SCHEMA IF EXISTS ${citarIdentificador(schema)} CASCADE`)
      .catch(() => undefined);
    await cliente.end();
  }
}

async function esperarColumnasPresentes(
  cliente: Client,
  schema: string,
  tabla: string,
  columnas: readonly string[],
): Promise<void> {
  const encontradas = await consultarColumnas(cliente, schema, tabla, columnas);
  expect(encontradas).toEqual([...columnas].sort());
}

async function esperarColumnasAusentes(
  cliente: Client,
  schema: string,
  tabla: string,
  columnas: readonly string[],
): Promise<void> {
  const encontradas = await consultarColumnas(cliente, schema, tabla, columnas);
  expect(encontradas).toEqual([]);
}

async function consultarColumnas(
  cliente: Client,
  schema: string,
  tabla: string,
  columnas: readonly string[],
): Promise<string[]> {
  const resultado = await cliente.query<{ column_name: string }>(
    `
      SELECT "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = $1
        AND "table_name" = $2
        AND "column_name" = ANY($3::text[])
      ORDER BY "column_name"
    `,
    [schema, tabla, columnas],
  );
  return resultado.rows.map((fila) => fila.column_name);
}

function quitarSchemaPrisma(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
}

function citarIdentificador(valor: string): string {
  return `"${valor.replaceAll('"', '""')}"`;
}

# Desarrollo local con Prisma/PostgreSQL

Guía para levantar PostgreSQL local, aplicar el schema, sembrar datos mínimos y
probar el flujo `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma` con
`PERSISTENCIA=prisma`, sin insertar datos a mano con SQL.

> El `docker-compose.test.yml` de este repo es **solo** para PostgreSQL
> local/test. No es una configuración de despliegue productivo.

Todos los comandos `npm` asumen la raíz del monorepo y usan
`--workspace=@normativo/infraestructura`.

## 1. Levantar PostgreSQL de test

```bash
docker compose -f docker-compose.test.yml up -d
```

Esto expone PostgreSQL 16 en `localhost:5433` (base `normativo_test`, usuario y
password `normativo`). La URL correspondiente:

```
postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public
```

## 2. Generar Prisma Client

Solo hace falta la primera vez o cuando cambia el schema:

```bash
npm run prisma:generate --workspace=@normativo/infraestructura
```

## 3. Aplicar el schema

Contra la base de test se usa `TEST_DATABASE_URL` (tiene prioridad sobre
`DATABASE_URL` **solo en la CLI y los scripts**: push, seed y tests; el runtime
de la aplicación lee únicamente `DATABASE_URL`, así una `TEST_DATABASE_URL`
filtrada al entorno productivo no redirige la app a la base de test). El script
aplica el schema con Prisma y luego agrega de forma idempotente los constraints
`CHECK` que Prisma no representa en `schema.prisma`:

```bash
TEST_DATABASE_URL="postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public" \
  npm run prisma:push --workspace=@normativo/infraestructura
```

> **`prisma:push` es exclusivamente local/test.** Nunca debe apuntar a una base
> productiva: no versiona cambios y puede requerir `--force-reset` ante
> constraints nuevos. El despliegue usa únicamente `prisma migrate deploy` con
> las migraciones versionadas de `prisma/migrations/`.

Para un reset limpio y destructivo de la base de test (borra todo):

```bash
TEST_DATABASE_URL="postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public" \
  npm run prisma:reset:test --workspace=@normativo/infraestructura
```

Si en el futuro se usan migraciones versionadas en despliegue:

```bash
DATABASE_URL="..." npm run prisma:migrate:deploy --workspace=@normativo/infraestructura
```

> La CLI `prisma` es una devDependency (el runtime solo usa `@prisma/client`).
> Un pipeline de despliegue que ejecute `prisma migrate deploy` debe instalar
> devDependencies en esa etapa o usar `npx prisma`.

## 4. Ejecutar el seed

El seed es **idempotente** (puede correrse varias veces sin duplicar) y solo
inserta datos de prueba (`@test.com`). **No** borra normas existentes.

```bash
TEST_DATABASE_URL="postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public" \
  npm run prisma:seed --workspace=@normativo/infraestructura
```

Para evitar ejecutar el seed contra una base equivocada:

- `TEST_DATABASE_URL` debe apuntar por defecto a la base `normativo_test` en
  `localhost`, `127.0.0.1` o `::1`.
- `DATABASE_URL` solo se permite con confirmación explícita:

```bash
PERMITIR_SEED_DESARROLLO=true DATABASE_URL="postgresql://normativo:normativo@localhost:5432/normativo?schema=public" \
  npm run prisma:seed --workspace=@normativo/infraestructura
```

Datos sembrados:

- Usuarios: `usuario-editor-1` (EDITOR), `usuario-superadmin-1`
  (SUPERADMINISTRADOR), `usuario-admin-1` (ADMINISTRADOR), `usuario-suscriptor-1`
  (SUSCRIPTOR).
- Suscripción `suscripcion-1` (cliente `cliente-1`, ACTIVA) que habilita el
  correo `suscriptor@test.com`.

El script vive en `packages/infraestructura/scripts/seed-prisma.js` y es la única
fuente de verdad de la semilla: el test e2e Prisma reutiliza la misma función
`sembrar(prisma)`.

## 5. Levantar el backend con Prisma

Para desarrollo se usa `DATABASE_URL` (por ejemplo la base de desarrollo en
`localhost:5432`; el `.env.example` trae ambos valores):

```bash
npm run build

PERSISTENCIA=prisma DATABASE_URL="postgresql://normativo:normativo@localhost:5432/normativo?schema=public" \
  npm run start --workspace=@normativo/infraestructura
```

El arranque valida la configuración y aborta con mensaje claro si algo está mal:

- `PERSISTENCIA` con un valor distinto de `memoria`/`prisma` es error (no hay
  fallback silencioso a memoria); en `NODE_ENV=production` además es obligatoria.
- Con `PERSISTENCIA=prisma`, `DATABASE_URL` debe existir y ser una URL postgres.
- `PUERTO` es opcional (default `3000`).

La identidad sigue simulada con el header `x-usuario-id` (no es autenticación
real). Ejemplo de flujo con `curl`:

```bash
# Registrar (editor)
curl -X POST localhost:3000/normas -H 'x-usuario-id: usuario-editor-1' \
  -H 'content-type: application/json' \
  -d '{"titulo":"Ley","contenido":"","tipoNorma":"Ley","institucionExpide":"Asamblea","fuente":"https://x/y.pdf","estadoJuridico":"VIGENTE","fechaExpedicion":"2025-01-01","fechaPublicacionOficial":"2025-01-02"}'

# Publicar (editor) -> incluye fechaPublicacionEnSistema
curl -X POST localhost:3000/normas/<ID>/publicar -H 'x-usuario-id: usuario-editor-1'

# Consultar contenido (suscriptor) -> incluye fuente, sin fechaPublicacionEnSistema ni estadoEditorial
curl localhost:3000/normas/<ID>/contenido -H 'x-usuario-id: usuario-suscriptor-1'
```

## 6. Ejecutar tests Prisma

Los tests Prisma se **saltan** si no está definido `TEST_DATABASE_URL`, así que
`npm test` general sigue verde sin PostgreSQL. Cuando la base de test está
arriba y con schema aplicado:

```bash
# Adaptadores + e2e HTTP Prisma (--runInBand). Ejecuta ambos archivos "*prisma*".
TEST_DATABASE_URL="postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public" \
  npm run test:prisma --workspace=@normativo/infraestructura
```

- Adaptadores: `src/persistencia/__tests__/prisma-adaptadores.test.ts`.
- E2E HTTP Prisma: `src/__tests__/normas-prisma.e2e.test.ts` (usa
  `@nestjs/testing` + `supertest`; no requiere un servidor externo).

Si `TEST_DATABASE_URL` está definido pero no apunta a `normativo_test` en un host
local permitido, los tests fallan a propósito para no escribir en una base
equivocada. Para escenarios excepcionales puede usarse
`PERMITIR_TEST_DATABASE_URL_NO_LOCAL=true`, pero no debe ser el flujo normal.

## Fuera de alcance (por ahora)

- Autenticación real (JWT/Passport/guards/sesiones).
- Redis y colas.
- Scraping.
- Algolia.
- Frontend.
- Outbox transaccional completo (la tabla `eventos_normas_publicadas` es solo
  almacenamiento simple del evento).

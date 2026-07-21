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

> **`migration_lock.toml` forma parte de la cadena versionada.**
> `prisma/migrations/migration_lock.toml` fija el proveedor (`postgresql`) y se
> versiona junto con las migraciones; no debe editarse a mano. Prisma 7 exige
> además una `datasource.shadowDatabaseUrl` para diferenciar un directorio de
> migraciones con `prisma migrate diff --from-migrations`. `prisma.config.ts`
> admite `SHADOW_DATABASE_URL` únicamente cuando se proporciona de forma
> explícita; debe apuntar a una base local, separada y desechable, nunca a la
> base principal ni a una base con datos que deban conservarse. La paridad se
> comprueba con `--from-migrations prisma/migrations --to-schema
> prisma/schema.prisma --exit-code`. Esta validación complementa la suite
> `migraciones-fase-5a-prisma.test.ts`, `prisma migrate status` y el diff de
> drift `--from-config-datasource --to-schema`.

> **Seguridad de la migración histórica de fuentes**
> (`20260712000000_migrar_fuentes_a_ediciones`): el backfill nunca descarta URLs
> históricas. Si una triple (`tipo`/`numero`/`fecha`) reúne más de una URL
> distinta, `prisma migrate deploy` **falla** con `INTEGRIDAD FASE 5A: ...
> múltiples fuentes distintas` y revierte por completo; las columnas legacy y
> sus URLs quedan intactas. Resuelva el conflicto dejando una única URL en los
> datos legacy (`normas.fuente` y `entradas_detectadas_registro_oficial.url_fuente`)
> y reintente el deploy. Prisma puede exigir marcar la ejecución fallida como
> *rolled back* antes de reintentar. La migración jamás elige una URL
> arbitrariamente; `CONFLICTIVA` sigue siendo un estado de runtime válido, pero
> no justifica perder datos históricos durante la migración.

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

> **El seed NO es el mecanismo operativo de producción.** Para inicializar o
> actualizar el SUPERADMINISTRADOR real existe el bootstrap (Fase 4E):
>
> ```bash
> PERMITIR_BOOTSTRAP_SUPERADMIN=true \
> DATABASE_URL="postgresql://..." \
> BOOTSTRAP_SUPERADMIN_CORREO="superadmin@ejemplo.com" \
> BOOTSTRAP_SUPERADMIN_PASSWORD="una-contrasena-de-12+caracteres" \
>   npm run bootstrap:superadmin --workspace=@normativo/infraestructura
> ```
>
> Requiere confirmación explícita; contra un host no local exige además
> `PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true`. Es idempotente, no borra
> datos, falla si el correo pertenece a otro usuario y nunca imprime la
> contraseña ni el hash. Variables opcionales: `BOOTSTRAP_SUPERADMIN_ID`,
> `_NOMBRE`, `_APELLIDO`. Detalle en ADR 0007.
>
> Flujo operativo completo: la contraseña de bootstrap es **temporal** (se
> genera con un password manager y se inyecta por variables seguras del
> entorno), tras el primer login se cambia de inmediato con
> `POST /auth/cambiar-contrasena` y las variables sensibles se borran/rotan.
> Ver "Ciclo de vida operativo" en ADR 0007.

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

Desde la Fase 4A los endpoints exigen `Authorization: Bearer <token>` (JWT
HS256; el header `x-usuario-id` ya no autentica). Desde la Fase 4B el flujo
principal es `POST /auth/login` con los usuarios seed (contraseña semilla
documentada `Password123!`, almacenada solo como hash scrypt):

```bash
TOKEN_EDITOR=$(curl -s -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"correo":"editor@test.com","contrasena":"Password123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
TOKEN_SUSCRIPTOR=$(curl -s -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"correo":"suscriptor@test.com","contrasena":"Password123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
```

Alternativa local sin login (herramienta de desarrollo, usa `JWT_SECRET` del
entorno o el secreto explícito de desarrollo, el mismo que la app fuera de
producción):

```bash
TOKEN_EDITOR=$(node packages/infraestructura/scripts/generar-token-dev.js usuario-editor-1)
TOKEN_SUSCRIPTOR=$(node packages/infraestructura/scripts/generar-token-dev.js usuario-suscriptor-1)
```

Ejemplo de flujo con `curl`:

```bash
# Registrar (editor)
curl -X POST localhost:3000/normas -H "Authorization: Bearer $TOKEN_EDITOR" \
  -H 'content-type: application/json' \
  -d '{"titulo":"Ley","contenido":[],"tipoNorma":"Ley","institucionExpide":"Asamblea","estadoJuridico":"VIGENTE","fechaExpedicion":null,"tipoPublicacionRegistroOficial":"RO","numeroPublicacionRegistroOficial":500,"fechaPublicacionOficial":"2025-01-02"}'

# Publicar (editor) -> incluye fechaPublicacionEnSistema
curl -X POST localhost:3000/normas/<ID>/publicar -H "Authorization: Bearer $TOKEN_EDITOR"

# Consultar contenido (suscriptor) -> incluye fuente, sin fechaPublicacionEnSistema ni estadoEditorial
curl localhost:3000/normas/<ID>/contenido -H "Authorization: Bearer $TOKEN_SUSCRIPTOR"
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

> **`test:prisma` valida antes de migrar.** El script corre a través del runner
> `scripts/ejecutar-tests-prisma.js`, que **exige** `TEST_DATABASE_URL` y valida
> que apunte a `normativo_test` en host local **antes** de ejecutar
> `prisma migrate deploy`. `DATABASE_URL` **nunca** la sustituye: si
> `TEST_DATABASE_URL` falta o es insegura, el proceso aborta sin tocar Prisma.
> La validación reutiliza `scripts/validar-url-base-datos.js` (única fuente de
> verdad) y la URL validada se pasa como `DATABASE_URL` solo a los procesos
> hijos. Para una URL de test no local se requiere
> `PERMITIR_TEST_DATABASE_URL_NO_LOCAL=true`.

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

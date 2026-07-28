# monorepo-normativo

Plataforma de suscripción para contenido normativo/legal. El producto final es
contenido normativo **estructurado, consultable y publicable** dentro de la
plataforma; los PDFs oficiales son fuente y fallback, no el producto.

## Stack

- Monorepo TypeScript (npm workspaces).
- Arquitectura Hexagonal / Clean Architecture ligera.
- Backend NestJS; persistencia PostgreSQL + Prisma.
- Pendientes por fase: Redis, frontend Next.js, búsqueda Algolia, despliegue Azure.

## Estructura

| Paquete | Contenido | Regla |
|---|---|---|
| `packages/dominio` | Entidades, enums y políticas de negocio | Sin dependencias de frameworks, HTTP ni base de datos |
| `packages/aplicacion` | Casos de uso y puertos | Depende solo de dominio |
| `packages/infraestructura` | NestJS, adaptadores Prisma y en memoria, scripts | Implementa los puertos de aplicación |

El código de dominio y aplicación está en español. La selección de persistencia
se hace con `PERSISTENCIA=memoria|prisma` (validada en el arranque; en
producción es obligatoria y sin fallback silencioso).

## Comandos

```bash
npm install

npm run typecheck   # los tres paquetes
npm run build
npm test            # dominio + aplicación + infraestructura (Prisma se salta sin TEST_DATABASE_URL)
```

PostgreSQL local de test y suite Prisma:

```bash
docker compose -f docker-compose.test.yml up -d

TEST_DATABASE_URL="postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public" \
  npm --workspace @normativo/infraestructura run test:prisma
```

Seed idempotente y guía completa de Prisma/PostgreSQL local:
[docs/desarrollo/prisma-postgresql-local.md](docs/desarrollo/prisma-postgresql-local.md).

## Documentación

- Reglas de negocio: [docs/reglas-negocio.md](docs/reglas-negocio.md)
- Visión de arquitectura: [docs/arquitectura/vision-arquitectura.md](docs/arquitectura/vision-arquitectura.md)
- ADRs: [docs/arquitectura/decisiones/](docs/arquitectura/decisiones/)

## Historial de fases

Cada fase cierra con un commit y un tag anotado (`git tag -n`):

- Fase 1: dominio (`fase-1-dominio*`).
- Fase 2: aplicación, políticas de acceso y eventos (`fase-2-*`).
- Fase 3A: backend NestJS con adaptadores en memoria.
- Fase 3B: persistencia Prisma/PostgreSQL.
- Fase 3C: endurecimiento de persistencia, seed idempotente y e2e Prisma.
- Fase 3D: publicación transaccional y endurecimiento de infraestructura.
- Fase 3E: configuración segura de arranque e idempotencia de publicación en DB.
- Fase 3F: CI con PostgreSQL y limpieza de deudas menores.
- Fase 3G: endurecimiento de dominio, validación de enums en mapeadores y documentación.
- Fase 4A: autenticación real mínima con Bearer token (JWT HS256).
- Fase 4B: login mínimo (`POST /auth/login`) y hash de contraseñas con scrypt.
- Fase 4C: los e2e consumen los endpoints con tokens emitidos por login real; `x-usuario-id` sin soporte legado alguno.
- Fase 4D: frontera autenticación/autorización endurecida y testeada — el guard solo autentica; los permisos salen de aplicación/dominio.
- Fase 4E: bootstrap operativo del SUPERADMINISTRADOR inicial y política mínima de contraseñas.
- Fase 4F: cambio de contraseña propia autenticado (`POST /auth/cambiar-contrasena`).
- Fase 4G: gestión mínima de usuarios internos (`POST /usuarios/sistema`, solo SUPERADMINISTRADOR; roles EDITOR/ADMINISTRADOR).
- Fase 4H: unicidad concurrente endurecida en la creación de usuarios internos.
- Fase 5A: ingesta por lote del Registro Oficial en borradores (`POST /ingesta/registro-oficial/resumenes` y consulta de lotes, solo SUPERADMINISTRADOR) y flujo editorial sobre `/normas` (lista/detalle/corrección/publicación múltiple de borradores para EDITOR y SUPERADMINISTRADOR).
- Fase 5B: resolución controlada de fuentes contra el catálogo oficial del Registro Oficial (`POST /ediciones-registro-oficial/resolver-pendientes`, solo SUPERADMINISTRADOR): adaptador HTTP real deshabilitable, resultado discriminado del puerto, procesamiento acotado y seguridad SSRF (ADR 0009).

## Autenticación

Los endpoints de normas exigen `Authorization: Bearer <token>` (JWT HS256
verificado en infraestructura con `jose`). El token solo identifica al usuario
(`sub`); los roles y permisos de negocio siguen resolviéndose con el `Usuario`
del dominio. El header `x-usuario-id` quedó eliminado como mecanismo de identidad.

- **Login**: `POST /auth/login` con `{ "correo", "contrasena" }` responde
  `{ "accessToken", "tokenType": "Bearer", "expiresIn" }`. Credenciales
  inválidas → 401 genérico (no revela si el correo existe). Las contraseñas se
  almacenan como hash scrypt (`usuarios.password_hash`, formato
  `scrypt:v1:...`); nunca en texto plano. Usuarios semilla locales usan la
  contraseña documentada `Password123!`.
- **Cambio de contraseña propia**: `POST /auth/cambiar-contrasena` (Bearer
  obligatorio) con `{ "contrasenaActual", "nuevaContrasena" }` → 204 sin
  cuerpo. Valida la contraseña actual, exige la política mínima (12+
  caracteres) y que la nueva sea distinta; 401 genérico si las credenciales no
  validan, 400 si la nueva contraseña es inválida o igual. No emite token
  nuevo ni revoca los existentes.
- `JWT_SECRET` es obligatorio en producción (mínimo 32 caracteres); fuera de
  producción hay un secreto explícito de desarrollo. `JWT_ISSUER` y
  `JWT_AUDIENCE` son opcionales. Ejemplos en `packages/infraestructura/.env.example`.
- Herramienta local alternativa (ya no el flujo principal):
  `node packages/infraestructura/scripts/generar-token-dev.js usuario-editor-1`.
- **Usuarios internos**: `POST /usuarios/sistema` (Bearer de SUPERADMINISTRADOR)
  crea usuarios EDITOR o ADMINISTRADOR con contraseña inicial (política mínima);
  responde 201 con datos públicos, 403 si el actor no es superadmin, 409 si el
  correo ya existe. Sin listar/editar/desactivar todavía.
- **Ingesta del Registro Oficial** (Fase 5A, plano técnico):
  `POST /ingesta/registro-oficial/resumenes` (Bearer de SUPERADMINISTRADOR)
  recibe el lote mensual completo detectado del resumen/índice (1–1500 entradas
  detectadas) y crea una norma en `BORRADOR` por cada entrada — nunca publica,
  incluso si el scraping no detectó ningún campo (los campos quedan
  vacíos/nulos, sin placeholders; `estadoJuridico` nace `VIGENTE`). El lote
  conserva año/mes en `periodo`; cada entrada no los duplica y usa
  `publicacion.fecha` para la fecha exacta detectada. La URL del
  resumen mensual no es la fuente oficial: la fuente es `urlPdf` de la
  `EdicionRegistroOficial` asociada y queda `null` mientras no esté resuelta.
  La ingesta asocia esa edición como principal y nunca crea cambios.
  `publicacion.fecha` y `fechaPublicacionOficial` usan estrictamente
  `YYYY-MM-DD`: son días calendario persistidos como PostgreSQL `DATE`, sin
  hora ni zona horaria.
  Solo existe un lote por año y mes. La idempotencia usa el período y
  `huellaLote`: un reenvío idéntico devuelve el resumen anterior con
  `creado: false`; el mismo período con contenido diferente responde 409. El
  límite inicial de 1500 puede ajustarse con `INGESTA_MAX_ENTRADAS` y el cuerpo
  JSON con `HTTP_JSON_BODY_LIMIT` (8mb por defecto). La ingesta no compara entradas ni busca
  posibles duplicados. `GET /ingesta/registro-oficial/lotes` y
  `GET /ingesta/registro-oficial/lotes/:id` son control técnico del scraping:
  solo SUPERADMINISTRADOR; el editor no navega por lotes (ADR 0008).
- **Flujo editorial de normas** (Fase 5A, plano editorial; EDITOR y
  SUPERADMINISTRADOR): `GET /normas?estadoEditorial=BORRADOR` lista los
  borradores como array estándar, sin total embebido ni señales técnicas de
  ingesta. Tanto el listado como `GET /normas/:id` incluyen, si la norma nació
  de ingesta, `origenRegistroOficial`
  (`urlResumenMensualRegistroOficial` + `segmentoCrudo`) para verificación
  visual; el detalle agrega `contenido`. `estadoResolucionFuente` aparece en
  normas `BORRADOR`, pero no en respuestas editoriales de normas `PUBLICADA`.
  Las respuestas usan únicamente `edicionesRegistroOficial`: principal
  primero y luego cambios por fecha oficial e ID; no exponen la FK interna ni
  campos singulares de edición/fuente. Al reemplazar la principal, la anterior
  se conserva como `CAMBIO` de forma transaccional. La publicación depende
  solo de la principal; los cambios no la bloquean.
  `PATCH /normas/:id` corrige/completa campos de un `BORRADOR` sin
  publicarlo; `POST /normas/:id/publicar` y `POST /normas/publicar`
  (múltiple, parcial: resultado por norma) exigen `titulo`, `tipoNorma`,
  `institucionExpide`, `estadoJuridico` y una `EdicionRegistroOficial`
  asociada cuya fuente esté disponible con resolución `RESUELTA` o `MANUAL`.
  `numero`, `fechaExpedicion` y `contenido` no son obligatorios para publicar.
- **Consulta de contenido y catálogo**: `SUPERADMINISTRADOR`, `ADMINISTRADOR`
  y `EDITOR` son usuarios internos y no requieren suscripción para consultar
  contenido `PUBLICADA`. `SUSCRIPTOR` requiere pertenecer a una cuenta mediante
  correo habilitado y una suscripción activa/vigente. En el catálogo de
  ediciones, `EDITOR` y `SUPERADMINISTRADOR` ven también ediciones incompletas y
  su estado; `ADMINISTRADOR` y `SUSCRIPTOR` solo ven ediciones completas y no
  reciben `estadoResolucionFuente`.
- **Resolución controlada de fuente** (Fase 5B; solo SUPERADMINISTRADOR):
  `POST /ediciones-registro-oficial/resolver-pendientes` resuelve `urlPdf`
  consultando el catálogo oficial del Registro Oficial (WordPress `admin-ajax`
  por carpeta-mes) por tipo + número + fecha detectada. Cada edición
  `PENDIENTE` sin URL se marca `RESUELTA` (coincidencia única y compatible),
  `NO_ENCONTRADA` (consulta exitosa sin coincidencias) o `CONFLICTIVA` (varias
  candidatas o fecha discrepante; nunca se elige arbitrariamente). Un fallo
  del catálogo **no** cambia la edición, nunca se confunde con `NO_ENCONTRADA`
  y conserva su clasificación real de extremo a extremo
  (`CATALOGO_TEMPORALMENTE_NO_DISPONIBLE`, `RESPUESTA_CATALOGO_INVALIDA`,
  `COBERTURA_CATALOGO_NO_DISPONIBLE` o `BUSQUEDA_CATALOGO_INCOMPLETA`): no
  todos los fallos son transitorios, pero todos dejan la edición `PENDIENTE`.
  Semántica **fail-closed**:
  `NO_ENCONTRADA` es ausencia real; toda incertidumbre (taxonomía no cubierta,
  HTML inesperado/mantenimiento, paginación truncada, URL coincidente inválida,
  fecha imposible) conserva la edición `PENDIENTE`. Solo procesa ediciones
  `PENDIENTE`: nunca sobrescribe `MANUAL` ni `RESUELTA`, y `NO_ENCONTRADA` o
  `CONFLICTIVA` son terminales para la resolución automática (reprocesarlas
  requerirá una futura operación explícita de reapertura; hoy la vía es la
  corrección manual). Usa compare-and-set (solo escribe si sigue `PENDIENTE`
  sin URL) y la fecha oficial detectada jamás se reemplaza. El cuerpo es
  opcional y acotado (`edicionIds` o `limite`, mutuamente excluyentes —
  enviar ambos → 400 —, propiedades adicionales → 400); la
  respuesta resume `procesadas/resueltas/noEncontradas/conflictivas/omitidas/erroresCatalogo/erroresPorRazon`.
  `erroresPorRazon` incluye siempre las cuatro razones del catálogo (aunque
  valgan cero) y `erroresCatalogo` es exactamente su suma; no existe un
  contador genérico `erroresTransitorios`.
  El proceso está acotado por lote (máximo seguro configurable) y con
  paralelismo limitado; no hay worker, cola ni background todavía. El adaptador
  deduplica y cachea localmente cada carpeta-mes (TTL corto, acotada, sin Redis)
  para no repetir la paginación por edición; `timeoutMs` es el presupuesto total
  de la carpeta-mes (incluida la lectura completa de cada body, no por página) y
  los reintentos son acotados (máx. 3/página, backoff local acotado; un
  `Retry-After` válido se respeta completo y, si no cabe en el presupuesto, no
  se reintenta). Límites máximos: timeout ≤ 30000 ms,
  concurrencia ≤ 4, ediciones/ejecución ≤ 50 (fuera de rango ⇒ fail-fast).
  La integración está **deshabilitada por defecto**: sin
  `CATALOGO_REGISTRO_OFICIAL_HABILITADO=true` + `..._BASE_URL`, el endpoint
  responde `503 CATALOGO_NO_DISPONIBLE` sin tocar ediciones. Deshabilitada,
  las demás variables `CATALOGO_REGISTRO_OFICIAL_*` residuales se ignoran
  (aunque sean inválidas) y la configuración vuelve con defaults seguros y
  deterministas; solo un valor no booleano de `..._HABILITADO` impide el
  arranque. Habilitada pero mal configurada, el arranque falla (fail-fast). Seguridad SSRF: la URL base
  sale solo de configuración (nunca del request), solo HTTPS (http únicamente
  en localhost), timeout y tamaño de respuesta acotados, redirects no seguidos
  a ciegas y allowlist de dominio para las URLs PDF. Variables en
  `packages/infraestructura/.env.example`. Ver ADR 0009.
- **Bootstrap operativo del SUPERADMINISTRADOR** (el seed es solo
  desarrollo/test): `npm run bootstrap:superadmin --workspace=@normativo/infraestructura`
  con `PERMITIR_BOOTSTRAP_SUPERADMIN=true`, `DATABASE_URL`,
  `BOOTSTRAP_SUPERADMIN_CORREO` y `BOOTSTRAP_SUPERADMIN_PASSWORD` (mínimo 12
  caracteres). Idempotente, no borra datos, falla si el correo pertenece a otro
  usuario, nunca imprime secretos; host remoto exige doble confirmación
  (`PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true`). Ver ADR 0007.
- Sigue siendo una implementación mínima: sin refresh tokens, sesiones,
  logout, revocación, registro público, OAuth ni Azure AD/B2C (ADR 0005 y 0006).

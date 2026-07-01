# ADR 0003: Persistencia Prisma/PostgreSQL en infraestructura

## Estado

Aceptada

## Contexto

Fase 2 dejó los casos de uso de aplicación `RegistrarNorma`, `PublicarNorma` y `ConsultarContenidoNorma` definidos sobre puertos. Fase 3A agregó NestJS mínimo y adaptadores en memoria para validar el flujo HTTP sin introducir persistencia real.

El siguiente paso es validar el mismo flujo con PostgreSQL real sin romper la arquitectura hexagonal:

- El dominio debe seguir sin depender de frameworks, Prisma, PostgreSQL ni NestJS.
- La aplicación debe seguir dependiendo solo del dominio y de puertos.
- Los casos de uso existentes no deben cambiar de contrato ni comportamiento.
- Infraestructura debe implementar adaptadores concretos para los puertos existentes.

También hay dos reglas globales que no pueden garantizarse dentro de una entidad aislada:

- No pueden existir dos usuarios con el mismo correo normalizado.
- Un correo no puede estar habilitado en más de una suscripción.

Estas reglas requieren garantía fuerte de base de datos desde el primer schema.

## Decisión

Se introduce Prisma/PostgreSQL únicamente en `packages/infraestructura`.

Se agregan:

- `packages/infraestructura/prisma/schema.prisma`.
- migración inicial SQL en `packages/infraestructura/prisma/migrations/`.
- `PrismaService` y `PrismaModule`.
- adaptadores Prisma para:
  - `RepositorioUsuarios`;
  - `RepositorioNormas`;
  - `RepositorioSuscripciones`;
  - `GeneradorIds`;
  - `PublicadorEventosNormas`.

Los adaptadores en memoria se mantienen para pruebas e2e y uso local simple. El módulo HTTP puede seleccionar persistencia con:

- `PERSISTENCIA=memoria` o sin valor: adaptadores en memoria;
- `PERSISTENCIA=prisma`: adaptadores Prisma/PostgreSQL.

## Schema inicial

El schema inicial incluye:

- `usuarios`;
- `normas`;
- `suscripciones`;
- `suscripcion_correos_habilitados`;
- `eventos_normas_publicadas`.

Los estados de dominio se almacenan como enums Prisma separados:

- `RolUsuarioPrisma`;
- `EstadoSuscripcionPrisma`;
- `EstadoNormaPrisma`;
- `EstadoEditorialNormaPrisma`.

`Norma` mantiene separados:

- estado jurídico (`estado_juridico`);
- estado editorial (`estado_editorial`).

No se agrega `UNIQUE` sobre `fuente` ni `numero`, porque una fuente puede contener varias normas y la estrategia de deduplicación normativa queda diferida.

No se agrega restricción de contenido no vacío. El modelo permite normas publicadas con metadata aprobada y contenido completo pendiente.

## Constraints de correos

PostgreSQL impone desde el primer schema:

- `usuarios.correo_normalizado UNIQUE`;
- `suscripcion_correos_habilitados.correo_normalizado UNIQUE`.

Esto respalda la firma `RepositorioSuscripciones.buscarPorCorreoHabilitado(correo): Promise<Suscripcion | null>` y evita resultados ambiguos.

La aplicación podrá validar preventivamente y traducir errores de constraint a errores de negocio, pero la garantía fuerte vive en PostgreSQL.

## Eventos y outbox

Para mantener el hito pequeño se adopta una tabla simple:

- `eventos_normas_publicadas`.

`PublicadorEventosNormasPrisma` guarda ahí el evento emitido por `PublicarNorma`. No llama Algolia, no usa colas y no implementa worker.

Esto no es todavía outbox transaccional completo. `PublicarNorma` sigue ejecutando:

1. guardar norma publicada;
2. publicar evento mediante puerto.

La solución definitiva para efectos externos reintentables seguirá siendo outbox transaccional o unidad de trabajo equivalente:

- guardar la norma publicada;
- registrar el evento pendiente;
- ejecutar ambas operaciones en la misma transacción;
- procesar el evento luego con worker/adaptador observable y con reintentos.

## Seed y flujo local (Fase 3C)

Para consolidar lo construido en Fase 3B sin introducir reglas de negocio nuevas, la Fase 3C agrega:

- Seed idempotente en `packages/infraestructura/scripts/seed-prisma.js`. Es JavaScript CommonJS que usa Prisma Client directamente con el adaptador `@prisma/adapter-pg`, sin dependencias nuevas. Usa `upsert` por clave primaria, por lo que puede ejecutarse varias veces sin duplicar y respeta los `UNIQUE`. Solo inserta datos de prueba (`@test.com`) y **no** borra normas. Exporta `sembrar(prisma)`, reutilizada por el e2e Prisma (única fuente de verdad del seed).
- Scripts npm en infraestructura: `prisma:generate`, `prisma:push`, `prisma:migrate:deploy`, `prisma:reset:test` (reset destructivo explícito de la base de test), `prisma:seed` y `test:prisma`.
- E2E HTTP contra Prisma/PostgreSQL en `src/__tests__/normas-prisma.e2e.test.ts`, que valida el flujo completo desde HTTP (`@nestjs/testing` + `supertest`) y verifica en PostgreSQL que la norma quede `PUBLICADA` y que se persista el evento.

Ambas familias de tests Prisma (adaptadores y e2e) se **saltan** si no está definido `TEST_DATABASE_URL`, y fallan si su valor no incluye `test`, para no escribir en una base equivocada. Por eso `npm test` general sigue verde sin PostgreSQL.

El detalle operativo (levantar PostgreSQL, aplicar schema, sembrar, arrancar backend, correr tests) está en `docs/desarrollo/prisma-postgresql-local.md`. El `docker-compose.test.yml` es solo para PostgreSQL local/test, no para despliegue productivo.

## Consecuencias

### Positivas

- Se valida persistencia real sin contaminar dominio ni aplicación.
- Los puertos existentes se mantienen estables.
- Las reglas globales de correo tienen respaldo fuerte en base de datos.
- Los e2e con memoria siguen siendo rápidos y simples.
- Los tests de integración Prisma validan mapeo entidad/base y constraints reales de PostgreSQL.

### Negativas

- Hay dos familias de adaptadores: memoria y Prisma.
- La selección por `PERSISTENCIA` es mínima y todavía no equivale a configuración productiva completa.
- La tabla `eventos_normas_publicadas` no resuelve por sí sola consistencia transaccional con publicación.

### Mitigaciones

- Mantener memoria como adaptador local/test, no como fuente de verdad.
- Documentar explícitamente que `eventos_normas_publicadas` no es outbox completo.
- Implementar outbox transaccional cuando se introduzca unidad de trabajo o transacciones de infraestructura.

## Fuera de alcance

- Autenticación real.
- Gestión comercial completa de cuentas/clientes/suscripciones.
- Algolia.
- Scraping.
- Frontend.
- Redis.
- Worker de outbox.
- Sincronización externa de eventos.

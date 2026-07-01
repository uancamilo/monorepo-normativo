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

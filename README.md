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

La identidad HTTP actual usa el header `x-usuario-id` como placeholder; la
autenticación real está pendiente (ver ADR 0004).

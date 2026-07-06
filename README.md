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
- `JWT_SECRET` es obligatorio en producción (mínimo 32 caracteres); fuera de
  producción hay un secreto explícito de desarrollo. `JWT_ISSUER` y
  `JWT_AUDIENCE` son opcionales. Ejemplos en `packages/infraestructura/.env.example`.
- Herramienta local alternativa (ya no el flujo principal):
  `node packages/infraestructura/scripts/generar-token-dev.js usuario-editor-1`.
- Sigue siendo una implementación mínima: sin refresh tokens, sesiones,
  logout, revocación, registro público, OAuth ni Azure AD/B2C (ADR 0005 y 0006).

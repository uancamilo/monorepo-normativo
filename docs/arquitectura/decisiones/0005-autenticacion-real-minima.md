# ADR 0005: Autenticación real mínima con Bearer token firmado

## Estado

Aceptada

## Contexto

Desde la Fase 3A la identidad HTTP se simulaba con el header `x-usuario-id`, un
placeholder inseguro documentado como deuda. Los casos de uso de aplicación ya
reciben `usuarioAutenticadoId` y cargan el `Usuario` desde `RepositorioUsuarios`,
así que solo faltaba que infraestructura obtuviera ese id de forma verificable.

## Decisión

Fase 4A introduce autenticación real mínima, confinada a
`packages/infraestructura/src/autenticacion/`:

- **JWT HS256** firmado con secreto simétrico (`JWT_SECRET`), verificado con la
  librería `jose` (estándar, pequeña, sin dependencias transitivas). Se fija
  `jose@4` porque las versiones 5+/6 son ESM puro e incompatibles con el
  runtime CommonJS de Jest del monorepo.
- `ServicioTokens` firma y verifica tokens (claims: `sub` obligatorio, `rol`
  informativo, `iat`/`exp`, `iss`/`aud` opcionales según configuración).
- `GuardAutenticacion` exige `Authorization: Bearer <token>` y deja el
  `UsuarioAutenticado` en la request; los controllers lo reciben con el
  decorador `UsuarioActual` y nunca parsean JWT.
- El header `x-usuario-id` **deja de existir como mecanismo**: no hay fallback
  legacy. Sin token o con token inválido la respuesta es 401 genérica.
- Configuración en `configuracion/jwt.ts`: en producción `JWT_SECRET` es
  obligatorio (mínimo 32 caracteres) y el arranque falla sin él; fuera de
  producción existe un secreto explícito de desarrollo/test, inválido por
  diseño para producción.

## Identidad vs permisos

El token **solo identifica** (`sub` = id del usuario). Los permisos de negocio
siguen resolviéndose con el `Usuario` del dominio que los casos de uso cargan
del repositorio; el claim `rol` es informativo y ninguna regla confía en él.
Un token válido cuyo `sub` no existe en el sistema produce 401
(`USUARIO_NO_ENCONTRADO`), coherente con el ADR 0004.

## Por qué no Passport / OAuth / Azure todavía

- Passport agrega abstracción e indirección sin aportar valor a un único
  esquema Bearer verificado con una función; se reevaluará si aparecen
  múltiples estrategias.
- OAuth/OIDC y Azure AD/B2C requieren infraestructura de identidad externa que
  el producto aún no necesita; la interfaz actual (guard + `UsuarioAutenticado`)
  permite sustituir el verificador sin tocar controllers ni aplicación.

## Pureza de dominio y aplicación

Dominio y aplicación no cambiaron: sin JWT, NestJS, HTTP ni `jose`. El contrato
`usuarioAutenticadoId` de los casos de uso se mantiene; solo cambió cómo
infraestructura lo obtiene.

## Riesgos

- Secreto simétrico único: su filtración permite forjar tokens. Mitigación
  futura: rotación de claves o firma asimétrica cuando haya emisor separado.
- No hay revocación: un token robado vale hasta su expiración (1 h por
  defecto). Aceptado en esta fase; sesiones/refresh quedan diferidos.
- ~~No existe endpoint de login: los tokens se emiten fuera de banda
  (`scripts/generar-token-dev.js` en local). El flujo de emisión real llegará
  con la gestión de usuarios.~~ Resuelto en Fase 4B: `POST /auth/login` emite
  tokens verificando credenciales (ADR 0006); el script queda como herramienta
  local secundaria.

## Fuera de alcance (diferido)

Refresh tokens, sesiones, revocación, login/registro público, recuperación de
contraseña, permisos granulares, OAuth/OIDC, Azure AD/B2C, Redis, frontend y
auditoría de accesos.

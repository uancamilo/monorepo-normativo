# ADR 0006: Login mínimo y hash de contraseñas con scrypt

## Estado

Aceptada

## Contexto

La Fase 4A introdujo autenticación real mínima con Bearer JWT (ADR 0005), pero
sin flujo de emisión: los tokens se generaban fuera de banda con
`scripts/generar-token-dev.js`. Para que la plataforma emita tokens de forma
real hace falta login con credenciales verificables.

## Decisión

Fase 4B agrega:

- **Caso de uso `IniciarSesion` en aplicación pura** (`packages/aplicacion/src/autenticacion/`),
  con puertos `RepositorioCredencialesUsuarios` y `VerificadorContrasenas`.
  Aplicación no conoce scrypt, jose, NestJS, HTTP ni Prisma; verifica
  credenciales y retorna `{ id, rol }` o `CREDENCIALES_INVALIDAS` única (no
  revela si el correo existe). No emite JWT.
- **Endpoint `POST /auth/login`** en infraestructura
  (`src/autenticacion/http/`): llama `IniciarSesion` y, si es exitoso, firma
  con el `ServicioTokens` existente. Respuesta:
  `{ accessToken, tokenType: "Bearer", expiresIn }`. 400 para solicitud
  inválida, 401 genérico para credenciales inválidas.
- **Hashing con `node:crypto` + scrypt** en
  `scripts/hash-contrasenas.js` (única fuente CJS, compartida con el seed) con
  wrapper tipado `ServicioHashContrasenas` que implementa el puerto
  `VerificadorContrasenas`. Formato versionado
  `scrypt:v1:<saltBase64>:<hashBase64>` (v1 = parámetros por defecto de Node:
  N=16384, r=8, p=1; salt 16 bytes; clave 64 bytes). Verificación con
  `timingSafeEqual`; cualquier hash inválido/corrupto produce `false`, nunca
  errores con detalles de formato.
- **`usuarios.password_hash` nullable** en Prisma/PostgreSQL (migración
  `20260706000000_agregar_password_hash_usuarios`). Nullable porque los
  usuarios existentes aún no tienen credenciales; un usuario sin hash no puede
  iniciar sesión.
- El seed asigna a los usuarios `@test.com` el hash de la contraseña semilla
  documentada `Password123!`; nunca se guarda texto plano.

## Por qué scrypt con node:crypto y no bcrypt/argon2

- Cero dependencias nuevas: scrypt viene en `node:crypto`, es un KDF de
  memoria dura aceptado (RFC 7914) y suficiente para el volumen actual.
- bcrypt/argon2 exigen binarios nativos (complican CI/despliegue) y no aportan
  ventaja decisiva en esta etapa. El formato versionado (`scrypt:v1:`)
  permite migrar de algoritmo o parámetros después sin romper hashes
  existentes: nuevos prefijos convivirían con los viejos.

## Alcance excluido

Sin refresh tokens, sesiones, logout, revocación, recuperación/cambio de
contraseña, registro público, OAuth/OIDC, Azure AD/B2C, Redis, permisos
granulares ni frontend. `generar-token-dev.js` sigue disponible como
herramienta local, ya no como flujo principal.

## Consecuencias y riesgos

- El rol viaja en el token solo como dato informativo (firmado en login); los
  permisos siguen saliendo del `Usuario` del dominio (test e2e lo garantiza).
- Sin revocación: un token emitido vale hasta expirar (1 h por defecto).
- Sin rate limiting en `/auth/login`: fuerza bruta posible; mitigar antes de
  exposición pública real.
- Diferencia de timing entre "correo inexistente" (sin scrypt) y "contraseña
  incorrecta" (con scrypt) podría permitir inferencia estadística de
  existencia de correos; aceptado por ahora, mitigable con hash dummy si se
  vuelve relevante.
- `password_hash` nullable es transitorio hasta que exista gestión de
  usuarios/credenciales completa.

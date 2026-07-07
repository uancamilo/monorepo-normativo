# ADR 0007: Bootstrap del superadministrador y política mínima de contraseñas

## Estado

Aceptada

## Contexto

Tras las Fases 4A–4D el sistema autentica con Bearer JWT y emite tokens vía
`POST /auth/login` contra credenciales scrypt. Pero el acceso operativo inicial
dependía conceptualmente del seed, que es un mecanismo de desarrollo/test con
usuarios `@test.com` y contraseña documentada. Faltaba un camino operativo,
seguro e idempotente para inicializar el SUPERADMINISTRADOR real.

## Decisión

Fase 4E agrega `scripts/bootstrap-superadmin.js` (CJS operativo, expuesto como
`npm run bootstrap:superadmin` en infraestructura):

- **Confirmación explícita obligatoria**: no se ejecuta sin
  `PERMITIR_BOOTSTRAP_SUPERADMIN=true`.
- **`DATABASE_URL` obligatoria** (no usa `TEST_DATABASE_URL`): es un mecanismo
  operativo, no de test.
- **Freno para bases remotas**: un host fuera de
  `localhost/127.0.0.1/::1` exige además
  `PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true`. Ejecutar contra producción es
  una decisión operativa consciente y de doble confirmación.
- **Variables**: `BOOTSTRAP_SUPERADMIN_CORREO` y
  `BOOTSTRAP_SUPERADMIN_PASSWORD` obligatorias; `BOOTSTRAP_SUPERADMIN_ID`,
  `_NOMBRE` y `_APELLIDO` opcionales con defaults. El correo se normaliza
  (trim + minúsculas).
- **Idempotente y acotado**: crea el usuario si no existe; si existe por id,
  actualiza datos mínimos y `password_hash`. Jamás borra ni toca otros
  usuarios, normas o suscripciones. Si el correo pertenece a **otro** usuario,
  falla explícitamente sin modificar nada.
- **Hash real**: reutiliza `scripts/hash-contrasenas.js` (scrypt `scrypt:v1:`),
  la misma fuente que login y seed.
- **Sin secretos en consola**: nunca imprime contraseña ni hash; el log
  muestra solo id, correo normalizado, acción (creado/actualizado) y base
  objetivo sin credenciales (`host/base`).

## Política mínima de contraseña

Validación operativa en infraestructura (el dominio no se contamina).
*Actualización Fase 4F*: la política se promovió a aplicación pura como
`PoliticaContrasenas` (usada por `CambiarContrasenaPropia`); el script de
bootstrap conserva su validación CJS equivalente como copia operativa
consciente (mismo patrón que `normalizarCorreo`).

- no vacía (el trim no puede quedar vacío);
- mínimo 12 caracteres;
- sin exigencias de complejidad adicionales por ahora.

## Seed vs bootstrap

- El **seed** (`prisma:seed`) sigue siendo exclusivamente desarrollo/test:
  usuarios `@test.com`, contraseña semilla documentada, guardas de
  `TEST_DATABASE_URL`/`PERMITIR_SEED_DESARROLLO`.
- El **bootstrap** es el mecanismo operativo controlado para el acceso real
  inicial. No comparten datos; comparten el helper de hashing.

## Fuera de alcance (diferido)

Gestión completa de usuarios, endpoints HTTP de creación/cambio de contraseña,
registro público, recuperación de contraseña, refresh tokens, sesiones,
logout, revocación, RBAC granular, frontend auth.

## Consecuencias y riesgos

- La contraseña viaja como variable de entorno del proceso: puede quedar en el
  historial del shell del operador; documentado — usar espacios iniciales o
  gestores de secretos según la disciplina del entorno.
- Sin rotación forzada ni expiración de contraseñas.
- La política de 12 caracteres es mínima deliberadamente; endurecer cuando
  exista gestión de usuarios.

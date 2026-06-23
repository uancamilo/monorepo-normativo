# Reglas de negocio

## 1. Propósito

Este documento centraliza las reglas de negocio vigentes, las reglas confirmadas pero diferidas y los límites explícitos del modelo actual de la plataforma de contenido normativo por suscripción.

Los tests del dominio siguen siendo la especificación ejecutable del comportamiento implementado. Este catálogo es la referencia humana para comprender las decisiones de negocio sin tener que reconstruirlas desde el código. Si una regla cambia, deben actualizarse este documento y los tests correspondientes antes o junto con la implementación.

## 2. Usuarios

### Reglas vigentes

- Un usuario tiene `id`, `nombre`, `apellido`, `correo` y `rol`.
- `id` no puede estar vacío ni contener únicamente espacios.
- `nombre` no puede estar vacío ni contener únicamente espacios.
- `apellido` no puede estar vacío ni contener únicamente espacios.
- `correo` no puede estar vacío ni contener únicamente espacios.
- `id` y `nombre` se normalizan mediante `trim()`.
- `apellido` se normaliza mediante `trim()`.
- `correo` se normaliza mediante `trim()` y conversión a minúsculas.
- `Usuario` expone los siguientes comportamientos:
  - `tieneId()`.
  - `obtenerId()`.
  - `tieneCorreo()`.
  - `obtenerCorreo()`.
  - `obtenerRol()`.
  - `tieneRol()`.

### Regla global diferida

- El correo electrónico identifica globalmente al usuario.
- No pueden existir dos usuarios con el mismo correo normalizado.
- La unicidad global del correo no se garantiza dentro de una entidad `Usuario` aislada. Se implementará en aplicación y persistencia, donde será posible consultar el conjunto de usuarios del sistema.

## 3. Roles del sistema

Los roles globales actuales son:

- `SUPERADMINISTRADOR`.
- `ADMINISTRADOR`.
- `EDITOR`.
- `SUSCRIPTOR`.

Reglas confirmadas:

- `SUPERADMINISTRADOR` tendrá los privilegios máximos del sistema.
- `ADMINISTRADOR` podrá crear y modificar cuentas/clientes y suscripciones en fases futuras.
- `EDITOR` no puede crear ni modificar cuentas/clientes ni suscripciones.
- `SUSCRIPTOR` puede consultar normas publicadas cuando su correo está habilitado por una suscripción activa y vigente.
- Dueño de cuenta y miembro no son roles globales del sistema.
- Dueño de cuenta y miembro son conceptos internos futuros del cliente/cuenta.
- Los privilegios administrativos completos todavía no están implementados.

## 4. Suscripciones

### Reglas vigentes

- Una suscripción tiene `id`, `clienteId`, `correosUsuariosHabilitados`, `cantidadMaximaUsuarios`, `estado`, `fechaInicio` y `fechaFin`.
- `id` no puede estar vacío ni contener únicamente espacios y se normaliza mediante `trim()`.
- `clienteId` no puede estar vacío ni contener únicamente espacios y se normaliza mediante `trim()`.
- Una suscripción pertenece a un cliente/cuenta mediante `clienteId`.
- Una suscripción no pertenece directamente a un usuario.
- El cliente/cuenta puede representar una empresa, una organización o una cuenta monousuario.
- En el modelo actual todavía no existen las entidades `Cliente`, `Cuenta` ni `Organizacion`.
- Una suscripción habilita usuarios por correo electrónico.
- Una suscripción puede habilitar uno o varios usuarios.
- Debe tener al menos un correo habilitado.
- Ningún correo habilitado puede estar vacío ni contener únicamente espacios.
- Los correos habilitados se normalizan mediante `trim()` y conversión a minúsculas.
- No puede haber correos habilitados duplicados dentro de la misma suscripción después de normalizarlos.
- `cantidadMaximaUsuarios` debe ser un entero mayor que `0`.
- `cantidadMaximaUsuarios` incluye al dueño de cuenta.
- La cantidad de correos habilitados no puede superar `cantidadMaximaUsuarios`.
- `fechaInicio` debe ser una fecha válida.
- `fechaFin` debe ser una fecha válida.
- `fechaFin` debe ser posterior a `fechaInicio`.
- Una suscripción está activa en una fecha de referencia solo si:
  - `estado` es `ACTIVA`.
  - `fechaInicio <= fechaReferencia`.
  - `fechaFin > fechaReferencia`.
- La vigencia se interpreta como el rango semiabierto `[fechaInicio, fechaFin)`.

Estados actuales:

- `ACTIVA`.
- `INACTIVA`.
- `VENCIDA`.
- `CANCELADA`.

### Regla global diferida

- Un correo no puede estar habilitado en más de una suscripción.
- La exclusividad global de un correo entre suscripciones no se garantiza dentro de una entidad `Suscripcion` aislada. Se implementará en aplicación y persistencia, donde será posible consultar todas las suscripciones relevantes.

## 5. Normas

### Reglas vigentes

- Una norma tiene `id`, `titulo`, `contenido`, `estado` y `fechaPublicacion`.
- `id` no puede estar vacío ni contener únicamente espacios.
- `titulo` no puede estar vacío ni contener únicamente espacios.
- `id` y `titulo` se normalizan mediante `trim()`.
- Una norma `PUBLICADA` debe tener `fechaPublicacion`.
- Si una norma no está `PUBLICADA`, `fechaPublicacion` queda en `null`, aunque se hubiera proporcionado otro valor al construirla.
- Solo una norma `PUBLICADA` se considera consultable por suscriptores.
- `contenido` sigue siendo un `string` libre en el modelo actual y no tiene validaciones de dominio adicionales.

Estados actuales:

- `BORRADOR`.
- `EN_REVISION`.
- `PUBLICADA`.
- `ARCHIVADA`.

Todavía no se modelan artículos, capítulos, secciones, entidad emisora, jurisdicción, vigencia normativa ni derogatorias.

## 6. Acceso a normas para suscriptores

La política vigente `PoliticaAccesoNormaSuscriptor` permite consultar una norma solo cuando se cumplen simultáneamente todas estas condiciones:

- El usuario tiene rol `SUSCRIPTOR`.
- La norma está `PUBLICADA`.
- La suscripción habilita el correo normalizado del usuario.
- La suscripción está `ACTIVA` y vigente en la fecha de referencia.

Límites de esta política:

- `SUPERADMINISTRADOR`, `ADMINISTRADOR` y `EDITOR` no acceden mediante esta política específica de suscriptor.
- Esto no significa que esos roles no tendrán acceso al sistema.
- Su acceso administrativo se implementará después mediante permisos explícitos o políticas separadas.
- La política no consulta bases de datos, no busca entidades, no usa HTTP y no depende de infraestructura.
- La política decide únicamente con entidades de dominio ya construidas que recibe como contexto.

## 7. Creación y modificación de cuentas y suscripciones

Las siguientes reglas están confirmadas, pero todavía no están implementadas:

- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden crear cuentas/clientes.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden modificar cuentas/clientes.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden crear suscripciones.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden modificar suscripciones.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden definir o modificar `cantidadMaximaUsuarios`.
- `EDITOR` no puede crear ni modificar cuentas/clientes.
- `EDITOR` no puede crear ni modificar suscripciones.
- El dueño de cuenta no puede crear la cuenta inicial.
- El dueño de cuenta no puede crear la suscripción inicial.
- El dueño de cuenta no puede modificar la suscripción.
- Los miembros no pueden crear ni modificar cuentas/clientes.
- Los miembros no pueden crear ni modificar suscripciones.
- Estas reglas se implementarán en la Fase 2 o en una fase posterior mediante casos de uso y, cuando corresponda, políticas de aplicación o dominio.
- La posibilidad futura de que el dueño de cuenta gestione miembros de su cuenta, si se aprueba, será una regla separada y no equivale a modificar la suscripción.

## 8. Reglas globales diferidas

Las siguientes reglas requieren consultar el estado global del sistema:

- No pueden existir dos usuarios con el mismo correo normalizado.
- Un correo no puede estar habilitado en más de una suscripción.
- Solo los roles autorizados pueden crear o modificar cuentas/clientes y suscripciones, y definir o modificar `cantidadMaximaUsuarios`.

Estas reglas no pueden garantizarse correctamente dentro de una entidad aislada. Se implementarán mediante casos de uso, puertos de repositorio y persistencia. Las entidades seguirán protegiendo únicamente sus invariantes locales.

## 9. Límites explícitos del modelo actual

Todavía no existen en el modelo:

- `Cliente`.
- `Cuenta`.
- `Organizacion`.
- `RolEnCuenta`.
- Dueño de cuenta formal.
- Miembros con estado.
- Invitaciones.
- Cupos dinámicos.
- Planes de suscripción.
- Categorías de normas por plan.
- Vigencia normativa real.
- Entidad emisora.
- Jurisdicción.
- Derogatorias.
- Auditoría funcional del sistema.
- Autenticación.
- Autorización administrativa completa.

## 10. Relación entre reglas, tests y código

| Área | Documento humano | Tests ejecutables | Código que aplica la regla |
|---|---|---|---|
| Usuarios | `docs/reglas-negocio.md` | `packages/dominio/src/usuarios/__tests__/Usuario.test.ts` | `packages/dominio/src/usuarios/entidades/Usuario.ts` |
| Suscripciones | `docs/reglas-negocio.md` | `packages/dominio/src/suscripciones/__tests__/Suscripcion.test.ts` | `packages/dominio/src/suscripciones/entidades/Suscripcion.ts` |
| Normas | `docs/reglas-negocio.md` | `packages/dominio/src/normas/__tests__/Norma.test.ts` | `packages/dominio/src/normas/entidades/Norma.ts` |
| Acceso a normas | `docs/reglas-negocio.md` | `packages/dominio/src/normas/__tests__/PoliticaAccesoNormaSuscriptor.test.ts` | `packages/dominio/src/normas/politicas/PoliticaAccesoNormaSuscriptor.ts` |
| Validaciones compartidas | `docs/reglas-negocio.md` | `packages/dominio/src/compartido/validaciones/__tests__/texto.test.ts` | `packages/dominio/src/compartido/validaciones/texto.ts` |

## 11. Procedimiento para cambiar una regla

1. Actualizar `docs/reglas-negocio.md`.
2. Actualizar o crear el test que exprese la nueva regla.
3. Modificar la entidad, política o caso de uso correspondiente.
4. Ejecutar `npm run typecheck`.
5. Ejecutar `npm test`.
6. Ejecutar `npm run build`.
7. Limpiar los artefactos con `rm -rf packages/dominio/dist packages/aplicacion/dist`.
8. Verificar la ausencia de `dist` y `coverage` con el comando acordado para el monorepo.
9. Hacer un commit pequeño y descriptivo.

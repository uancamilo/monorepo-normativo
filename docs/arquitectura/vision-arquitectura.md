# Visión de Arquitectura

## Propósito del Sistema

Plataforma de contenido normativo por suscripción que permite a usuarios acceder a normas jurídicas y documentos regulatorios bajo un modelo de acceso controlado.

## Principios Arquitectónicos

- **Dominio aislado**: la lógica de negocio no depende de frameworks, bases de datos ni protocolos de transporte.
- **Puertos y adaptadores**: las capas externas (HTTP, persistencia, mensajería) se conectan al dominio mediante interfaces (puertos).
- **Modularidad por capacidades de negocio**: el dominio se organiza en módulos que representan áreas funcionales (usuarios, suscripciones, normas), no en carpetas técnicas globales (entidades/, enums/, politicas/). Cada módulo contiene sus propias entidades, enums y políticas.
- **Encapsulamiento del estado interno**: las entidades exponen comportamiento, no propiedades primitivas. Las políticas de dominio delegan en métodos de las entidades en lugar de comparar identificadores directamente.
- **Lenguaje ubicuo en español**: todas las entidades, enums y políticas usan terminología del dominio normativo.

## Capas del Sistema

```
[Infraestructura] → [Aplicación] → [Dominio]
     (adaptadores)     (casos de uso)   (entidades, políticas)
```

### Dominio (`packages/dominio`)

Contiene entidades, enums y políticas de negocio organizados por módulo funcional. No tiene dependencias externas.

#### Modelo de suscripción por cliente/cuenta

- Una suscripción pertenece a un cliente/cuenta, no a un usuario individual. El cliente/cuenta puede corresponder a una empresa, una organización o una cuenta monousuario.
- En esta fase, `Suscripcion` representa la relación mediante `clienteId`; todavía no se implementan las entidades `Cliente`, `Cuenta` u `Organizacion`.
- Una suscripción habilita uno o varios usuarios por correo electrónico y define `cantidadMaximaUsuarios`. El dueño de cuenta está incluido en esa cantidad máxima.
- Las normas con flujo editorial `PUBLICADA` pueden aparecer en búsqueda pública y solo pueden consultarse como contenido completo por usuarios autenticados con acceso por suscripción activa y vigente que habilite su correo normalizado.
- El correo electrónico identifica globalmente a un usuario. No pueden existir dos usuarios con el mismo correo y un correo no puede estar habilitado en más de una suscripción.
- `Suscripcion` valida únicamente correos duplicados dentro de su propia lista, después de normalizarlos. La unicidad global de usuarios por correo y la pertenencia exclusiva del correo a una suscripción se aplicarán en una fase posterior desde aplicación y persistencia.
- Cuando exista Prisma/PostgreSQL, `usuarios.correo_normalizado` y `suscripcion_correos_habilitados.correo_normalizado` deben tener constraints `UNIQUE` desde el primer schema. Esto evita que puertos como `RepositorioSuscripciones.buscarPorCorreoHabilitado(correo)` tengan resultados ambiguos.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` podrán crear o modificar cuentas/clientes y suscripciones, y definir o modificar `cantidadMaximaUsuarios`. `EDITOR` no podrá realizar esas operaciones.
- Dueño de cuenta y miembros son conceptos internos del cliente/cuenta, no roles administrativos globales. El dueño no puede crear la cuenta inicial, crear la suscripción inicial ni modificar la suscripción. Los miembros no pueden crear ni modificar cuentas/clientes ni suscripciones. Una eventual gestión de miembros por el dueño de cuenta sería una regla separada.
- En la fase 1 no se implementan `Cliente`, `Cuenta`, `Organizacion`, `RolEnCuenta`, invitaciones, cupos dinámicos, estados por miembro ni una política de creación de suscripciones.

#### Modelo de Norma

- `EstadoNorma` representa únicamente estado jurídico: `VIGENTE`, `REFORMADA` o `DEROGADA`. `ARCHIVADA` no existe como estado jurídico.
- `EstadoEditorialNorma` representa el flujo editorial interno: `BORRADOR`, `EN_REVISION` o `PUBLICADA`.
- `Norma.estaVisibleParaSuscriptores()` se mantiene solo como nombre técnico heredado del método existente; la regla de negocio depende de `estadoEditorial = PUBLICADA`.
- Una norma no se reforma ni se deroga por voluntad editorial. Reforma y derogatoria requieren sustento normativo; la trazabilidad profunda queda diferida.
- `tipoNorma` e `institucionExpide` pueden estar vacíos en `BORRADOR` y son obligatorios al publicar.
- `numero` es opcional.
- `Norma` conserva internamente una FK nullable a su `EdicionRegistroOficial` principal y puede relacionarse con cero o más ediciones de cambio mediante una tabla explícita muchos-a-muchos. Una edición puede ser principal o cambio de múltiples normas. Las respuestas proyectan solo `edicionesRegistroOficial`: principal primero y cambios por fecha oficial ascendente e ID; no exponen la FK ni campos singulares de edición/fuente.
- `fechaExpedicion` pertenece a `Norma` y es opcional al publicar; `fechaPublicacionOficial` pertenece a `EdicionRegistroOficial`. `fechaPublicacionEnSistema` es una fecha interna del flujo editorial.
- `EdicionRegistroOficial.fechaPublicacionOficial` se modela como fecha calendario: contrato `YYYY-MM-DD`, representación canónica a medianoche UTC en las capas puras y columna PostgreSQL `DATE`. No admite hora ni zona horaria, lo que preserva la unicidad de la triple de edición.
- `SUSCRIPTOR` no modifica normas. `EDITOR` y `SUPERADMINISTRADOR` pueden modificar contenido y metadata, pero no inventar reforma o derogatoria sin sustento jurídico.
- La política canónica actual para decidir el acceso al contenido completo de una norma es `PoliticaAccesoContenidoNorma`.
- `PoliticaAccesoNormaSuscriptor` queda como política heredada (`@deprecated`) que conserva la semántica basada en el rol global `SUSCRIPTOR`; debe usarse solo para compatibilidad y delega en `PoliticaAccesoContenidoNorma`.
- Una norma puede pasar a `PUBLICADA` con metadata aprobada aunque todavía no tenga contenido completo. `Norma` permite `contenido` libre sin validar no vacío para soportar el poblamiento inicial descrito en la sección de pipeline de ingesta normativa.

Estructura:
```
src/
├── index.ts
├── compartido/
│   └── validaciones/
│       ├── texto.ts
│       └── __tests__/
│           └── texto.test.ts
├── usuarios/
│   ├── entidades/Usuario.ts
│   ├── enums/RolUsuario.ts
│   └── __tests__/Usuario.test.ts
├── suscripciones/
│   ├── entidades/Suscripcion.ts
│   ├── enums/EstadoSuscripcion.ts
│   └── __tests__/Suscripcion.test.ts
└── normas/
    ├── entidades/Norma.ts
    ├── enums/EstadoNorma.ts
    ├── enums/EstadoEditorialNorma.ts
    ├── politicas/
    │   ├── PoliticaAccesoContenidoNorma.ts
    │   └── PoliticaAccesoNormaSuscriptor.ts
    └── __tests__/
        ├── Norma.test.ts
        ├── PoliticaAccesoContenidoNorma.test.ts
        └── PoliticaAccesoNormaSuscriptor.test.ts
```

### Aplicación (`packages/aplicacion`)

Paquete TypeScript puro iniciado en la fase 2. Contiene los casos de uso que orquestan el dominio y los puertos que serán implementados posteriormente por infraestructura.

- Depende de `packages/dominio`.
- No depende de infraestructura.
- Define al menos los puertos de repositorio `RepositorioUsuarios`, `RepositorioNormas` y `RepositorioSuscripciones`, además del puerto `GeneradorIds`.
- Incluye los casos de uso `RegistrarNorma`, `PublicarNorma` y `ConsultarContenidoNorma`, que cierran el flujo mínimo de aplicación `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma`.
- Implementa el caso de uso `ConsultarContenidoNorma`, que orquesta esos puertos y la política de dominio `PoliticaAccesoContenidoNorma`.
- La metadata interna/editorial como `fechaPublicacionEnSistema` queda fuera de la consulta de contenido del suscriptor (`ConsultarContenidoNorma` no la devuelve). Desde la Fase 5A la consulta editorial vive en casos de uso separados (`ConsultarNormas`, `ConsultarNorma`); `PublicarNorma`, como acción editorial, sí puede devolver `fechaPublicacionEnSistema`.
- Implementa el caso de uso `PublicarNorma`, que orquesta `RepositorioUsuarios`, `RepositorioNormas`, la política de aplicación `PoliticaGestionEditorialNorma` y el puerto `UnidadDeTrabajoPublicacionNorma`, responsable de persistir la norma publicada y el evento de publicación como una unidad atómica en infraestructura persistente.
- Implementa el caso de uso `RegistrarNorma`, que registra una norma inicial en estado editorial `BORRADOR`. Orquesta `RepositorioUsuarios`, `RepositorioNormas`, la política de aplicación `PoliticaGestionEditorialNorma` y el puerto `GeneradorIds`. `RegistrarNorma` usa `GeneradorIds` como puerto para evitar acoplar la aplicación a infraestructura (`crypto`, UUID o base de datos). Registrar no publica la norma, no emite evento y no sincroniza el índice público.
- La sincronización futura del índice público (Algolia) queda detrás de eventos de aplicación: `PublicarNorma` registra un evento al publicar una norma. No existe adaptador real de Algolia ni SDK de Algolia en este hito.
- `PublicadorEventosNormas` no implica una llamada directa a Algolia. En infraestructura real, el adaptador debe usar outbox transaccional o un mecanismo equivalente con garantía transaccional para que la publicación de la norma no quede acoplada al estado operativo de Algolia.

### Infraestructura (`packages/infraestructura`)

Paquete iniciado en la Fase 3A. Contiene una primera capa HTTP con NestJS mínimo que expone el flujo de aplicación `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma`. En Fase 3B incorpora persistencia Prisma/PostgreSQL como adaptadores de infraestructura para los puertos de aplicación.

- Depende de `packages/aplicacion` y `packages/dominio`. Dominio y aplicación no dependen de infraestructura.
- Los casos de uso se componen por inyección de dependencias de NestJS recibiendo implementaciones de puertos; la aplicación no conoce NestJS.
- Desde la Fase 4A la identidad es autenticación real mínima: `Authorization: Bearer <token>` (JWT HS256 verificado con `jose` por `GuardAutenticacion` en `src/autenticacion/`). El token solo identifica (`sub`); los permisos siguen resolviéndose con el `Usuario` del dominio dentro de los casos de uso. El header `x-usuario-id` fue eliminado como mecanismo. Sin token o con token inválido los endpoints responden `401` (ADR 0005).
- Desde la Fase 4B existe `POST /auth/login`: el caso de uso puro `IniciarSesion` (`packages/aplicacion/src/autenticacion/`) verifica credenciales mediante los puertos `RepositorioCredencialesUsuarios` y `VerificadorContrasenas`; infraestructura implementa el hashing con scrypt de `node:crypto` (`ServicioHashContrasenas`, formato `scrypt:v1:...` sobre `usuarios.password_hash` nullable) y emite el JWT con `ServicioTokens`. Credenciales inválidas responden `401` genérico sin revelar si el correo existe. No hay refresh tokens, sesiones, logout, revocación, registro público, OAuth ni Azure AD/B2C todavía (ADR 0006).
- La Fase 4C consolida el flujo: los endpoints de normas se consumen con tokens emitidos por `POST /auth/login` (los e2e memoria y Prisma lo ejercitan de punta a punta); `x-usuario-id` no tiene soporte legado ni modo de compatibilidad — enviarlo sin Bearer produce `401`.
- Desde la Fase 4F existe `POST /auth/cambiar-contrasena` (Bearer obligatorio): el caso de uso puro `CambiarContrasenaPropia` valida la contraseña actual contra el hash, aplica la política mínima de contraseñas (`PoliticaContrasenas`, promovida a aplicación) y actualiza `password_hash` mediante el puerto de credenciales extendido (`buscarPorUsuarioId`, `actualizarPasswordHash`). Responde `204` sin cuerpo; `401` genérico para credenciales inválidas; `400` para nueva contraseña inválida o igual a la actual. No emite tokens ni revoca los existentes (sin modelo de sesión todavía).
- Desde la Fase 4G existe gestión mínima de usuarios internos: `POST /usuarios/sistema` (Bearer, solo SUPERADMINISTRADOR) crea usuarios EDITOR o ADMINISTRADOR mediante el caso de uso puro `CrearUsuarioSistema` (puerto `RepositorioUsuariosSistema` con adaptadores memoria y Prisma; el UNIQUE de `usuarios.correo_normalizado` es la garantía fuerte de unicidad). No crea roles dinámicos, SUSCRIPTOR ni otros SUPERADMINISTRADOR; sin listar/editar/desactivar usuarios todavía. Con esto el flujo operativo deja de depender del seed: bootstrap → login → cambio de contraseña → creación de usuarios internos desde la API. Desde la Fase 4H el puerto `RepositorioUsuariosSistema.crear` expresa el duplicado concurrente como resultado tipado: el adaptador Prisma traduce el `P2002` del UNIQUE de correo a `CORREO_YA_REGISTRADO` (otros errores se propagan sin ocultarse) y el adaptador en memoria re-verifica el correo como garantía final equivalente; HTTP sigue respondiendo 409 sin filtrar errores crudos de infraestructura.
- **Bootstrap operativo (Fase 4E).** El seed queda confinado a desarrollo/test; el acceso operativo inicial se inicializa con `scripts/bootstrap-superadmin.js` (`npm run bootstrap:superadmin`): confirmación explícita `PERMITIR_BOOTSTRAP_SUPERADMIN=true`, `DATABASE_URL` obligatoria, doble confirmación para hosts no locales, correo normalizado, política mínima de contraseña (12+ caracteres), hash scrypt compartido con login, idempotente, acotado a un solo usuario y sin secretos en consola (ADR 0007). Ciclo de vida operativo: contraseña inicial temporal generada con password manager e inyectada por variables seguras → bootstrap → login → cambio inmediato de contraseña (Fase 4F) → borrado/rotación de las variables sensibles. No hay registro público ni recuperación de contraseña todavía.
- **Frontera autenticación/autorización (Fase 4D).** `GuardAutenticacion` solo autentica: verifica el Bearer (firma, expiración, `sub`) y entrega la identidad; no valida roles ni decide permisos, y el claim `rol` del token es un dato informativo que ningún componente usa para autorizar. La autorización vive en aplicación/dominio: los permisos editoriales (registrar/publicar) salen del `Usuario` recuperado por los casos de uso vía `PoliticaGestionEditorialNorma`, y la lectura de contenido se decide por suscripción activa/vigente con correo habilitado y norma `PUBLICADA` (`PoliticaAccesoContenidoNorma`) — nunca por rol global: EDITOR/ADMINISTRADOR/SUPERADMINISTRADOR sin suscripción no leen contenido. HTTP (`mapeo-http`) solo traduce las razones de aplicación a códigos (identidad inexistente `401`; denegaciones de negocio colapsadas a `403` genérico; inexistente `404`; conflicto `409`), sin reglas de negocio propias. RBAC granular, refresh tokens, revocación, logout, sesiones y auth de frontend siguen fuera de alcance.
- Desde la Fase 5A existe la ingesta por lote del Registro Oficial (plano técnico): `POST /ingesta/registro-oficial/resumenes` (Bearer, solo SUPERADMINISTRADOR) recibe, cuando el extractor termina, un único lote mensual completo con hasta 1500 `entradasDetectadas` y crea una `Norma` en `BORRADOR` por cada entrada mediante el caso de uso puro `IngerirResumenRegistroOficial` (puerto `RepositorioIngestaRegistroOficial` con adaptadores memoria y Prisma; persistencia atómica de lote + entradas + ediciones + normas). Los campos no detectados quedan vacíos/nulos, sin placeholders; `estadoJuridico` nace `VIGENTE`. La `urlResumenMensualRegistroOficial` pertenece al lote y nunca se usa como fuente oficial; la fuente se conserva como `urlPdf` de la `EdicionRegistroOficial` asociada. El lote conserva `huellaLote`, período, `fechaEjecucion`, `urlResumenMensualRegistroOficial` y `versionExtractor`; no persiste identificador de ejecución, partes, estados, fuente, creador ni métricas. Solo existe un lote por año y mes, garantizado por PostgreSQL; período + huella permiten reutilizar un reenvío idéntico (`creado: false`) y rechazar con 409 contenido diferente. El POST devuelve solo el resumen; las entradas se consultan por `GET /ingesta/registro-oficial/lotes/:id`. El máximo se configura en infraestructura con `INGESTA_MAX_ENTRADAS` (1500 por defecto) y el límite HTTP con `HTTP_JSON_BODY_LIMIT` (8mb por defecto). Sin scraping real, PDF parsing, LLM, OCR, partes, staging ni colas (ADR 0008).
- La Fase 5A también agrega el flujo editorial sobre `/normas` (EDITOR y SUPERADMINISTRADOR; el editor no navega por lotes): `ConsultarNormas` (`GET /normas?estadoEditorial=BORRADOR`, array estándar sin total embebido ni señales técnicas de ingesta) y `ConsultarNorma` (`GET /normas/:id`, detalle con `contenido`) proyectan `origenRegistroOficial` — `urlResumenMensualRegistroOficial` + `segmentoCrudo` — cuando la norma nació de ingesta, tanto en `BORRADOR` como en `PUBLICADA`; el origen se arma a través del puerto de solo lectura `ConsultorOrigenRegistroOficialNorma`, cuya consulta masiva evita N+1 en listados, y no se expone al lector por suscripción. Un segundo puerto de lectura masiva consulta las ediciones de cambio sin N+1. `ActualizarNorma` (`PATCH /normas/:id`, solo `BORRADOR`; una `PUBLICADA` responde `NORMA_NO_EDITABLE` 409) y `PublicarNormas` (`POST /normas/publicar`, publicación múltiple parcial con resultado por norma). `Norma.camposFaltantesParaPublicar()` valida únicamente `tipoNorma`, `titulo`, `institucionExpide`, `estadoJuridico` y la asociación principal; `PublicarNorma` y `PublicarNormas` validan además que la principal tenga fuente y resolución compatible. Los cambios no bloquean la publicación. `numero`, `fechaExpedicion` y `contenido` no son obligatorios.
- `PATCH /normas/:id/edicion-registro-oficial` identifica una nueva principal. Si ya era la principal, es idempotente; si reemplaza otra, conserva la anterior como `CAMBIO`, retira la nueva de cambios y actualiza la FK en una sola operación atómica. Una norma `PUBLICADA` solo admite una nueva principal publicable. Todavía no existen endpoints para agregar o retirar cambios ni se modelan las relaciones jurídicas Norma–Norma, artículos afectados o tipos de reforma.
- `EdicionRegistroOficial` es el catálogo interno y la dueña de `urlPdf`; no existe todavía un adaptador al catálogo oficial externo. Por seguridad, `POST /ediciones-registro-oficial/resolver-pendientes` autentica y autoriza al `SUPERADMINISTRADOR`, pero responde `503 CATALOGO_NO_DISPONIBLE` antes de leer o modificar ediciones mientras la integración no esté configurada. Los fakes con candidatos solo existen en tests de aplicación; ningún módulo ejecutable fabrica URLs.
- Endpoints: `POST /normas` (registrar), `GET /normas` (lista editorial), `GET /normas/:id` (detalle editorial), `PATCH /normas/:id` (corrección), `POST /normas/:id/publicar` (publicar), `POST /normas/publicar` (publicación múltiple), `GET /normas/:id/contenido` (consultar como lector), `POST /ingesta/registro-oficial/resumenes` (ingerir lote), `GET /ingesta/registro-oficial/lotes` y `GET /ingesta/registro-oficial/lotes/:id` (control técnico de ingesta). Las razones de fallo de los casos de uso se traducen a códigos HTTP en infraestructura (`mapeo-http`), no en aplicación.
- Los adaptadores en memoria siguen disponibles para pruebas e2e y arranque local simple (`PERSISTENCIA=memoria`, valor por defecto): `RepositorioUsuariosEnMemoria`, `RepositorioNormasEnMemoria`, `RepositorioSuscripcionesEnMemoria`, `GeneradorIdsSecuencial`, `PublicadorEventosNormasEnMemoria`.
- Los adaptadores Prisma se activan con `PERSISTENCIA=prisma`: `RepositorioUsuariosPrisma`, `RepositorioNormasPrisma`, `RepositorioSuscripcionesPrisma`, `GeneradorIdsUuid` y `UnidadDeTrabajoPublicacionNormaPrisma`.
- Prisma/PostgreSQL impone `UNIQUE` para `usuarios.correo_normalizado` y `suscripcion_correos_habilitados.correo_normalizado` desde el schema inicial. También impone `CHECK` para `suscripciones.cantidad_maxima_usuarios > 0` y `suscripciones.fecha_fin > suscripciones.fecha_inicio`. La aplicación podrá traducir errores de constraint a errores de negocio, pero la garantía fuerte vive en la base de datos.
- `UnidadDeTrabajoPublicacionNormaPrisma` usa `prisma.$transaction` para publicar y registrar el evento en `eventos_normas_publicadas` de forma atómica. La transición es una actualización condicionada que escribe solo `estado_editorial` y `fecha_publicacion_en_sistema` y exige atómicamente, sobre el estado persistido vigente: `id` + `estadoEditorial = BORRADOR`, los obligatorios de publicación no vacíos (`tipo_norma`, `titulo`, `institucion_expide`, `estado_juridico`) y la asociación a una edición publicable (`RESUELTA` o `MANUAL` con `url_pdf`, verificada mediante filtro de relación en la misma actualización). Si afecta cero filas no inserta evento y clasifica el conflicto dentro de la transacción: `NORMA_YA_PUBLICADA` si otra publicación ganó, `NORMA_MODIFICADA_CONCURRENTEMENTE` si la norma sigue en `BORRADOR` pero una modificación concurrente invalidó las precondiciones. Una doble publicación concurrente nunca llega al `UNIQUE` de `norma_id` ni filtra un `P2002`, y el evento calcula `tiene_contenido_completo` desde la fila persistida vigente, no desde la copia leída. Esta tabla sigue siendo almacenamiento simple del evento; no hay worker, cola, Redis ni Algolia real todavía.
- Concurrencia editorial (estabilización de Fase 5A): el puerto `RepositorioNormas` expone escrituras condicionadas y tipadas — `actualizarBorrador` (corrección solo si la norma sigue en `BORRADOR`, escribe únicamente datos editoriales) y `cambiarEdicionSiEstado` (cambia solo la FK de edición bajo el estado editorial esperado). Los conflictos esperados se expresan como resultados discriminados de aplicación (`NORMA_NO_EDITABLE`, `ESTADO_EDITORIAL_CAMBIO_CONCURRENTE`, `NORMA_YA_PUBLICADA`, `NORMA_MODIFICADA_CONCURRENTEMENTE`), nunca como excepciones ni errores Prisma; los adaptadores en memoria implementan la misma semántica que los de Prisma (incluida la restauración de la norma anterior si falla la emisión del evento, equivalente en memoria del rollback transaccional). Una corrección obsoleta no revierte una norma publicada, publicar no sobrescribe correcciones concurrentes y la validación previa del caso de uso nunca reemplaza la barrera atómica de persistencia: una modificación concurrente que invalida la publicación responde 409, no crea evento y deja la norma en `BORRADOR`.
- La Fase 3C consolida la persistencia: agrega un seed idempotente de desarrollo/test (`scripts/seed-prisma.js`, reutilizado por el e2e Prisma), scripts npm (`prisma:seed`, `test:prisma`, etc.) y un e2e HTTP contra Prisma/PostgreSQL. Los tests Prisma se saltan si no hay `TEST_DATABASE_URL`, de modo que `npm test` general sigue verde sin PostgreSQL. El flujo local está documentado en `docs/desarrollo/prisma-postgresql-local.md`.
- La Fase 3D endurece consistencia e infraestructura: agrega transacción Prisma para publicación, constraints `CHECK`, validación robusta de `TEST_DATABASE_URL`, seed con confirmación explícita para `DATABASE_URL`, tokens NestJS en archivo dedicado y selección de persistencia extraída a función testeable.
- Las fases 3B, 3C y 3D no implementan Redis, colas, worker, scraping, Algolia real, frontend ni autenticación real.

El modelo de búsqueda futura separará búsqueda pública y búsqueda editorial interna. Algolia será infraestructura futura para la búsqueda pública como índice derivado; la base de datos seguirá siendo la fuente de verdad y el dominio no dependerá de Algolia.

Autocomplete e InstantSearch podrán implementarse directamente en frontend con librerías de Algolia. Por eso, la aplicación/backend no necesita duplicar la experiencia pública como un caso de uso tradicional si esa interacción queda resuelta en frontend.

La aplicación/backend sí debe controlar la publicación, actualización y retiro de normas del índice público mediante eventos, cola o un mecanismo equivalente futuro. Para efectos externos reintentables, como sincronizar Algolia, el mecanismo previsto es outbox transaccional: persistir la norma y el evento pendiente en la misma transacción, y entregar el evento después mediante infraestructura observable y con reintentos. El índice público no debe exponer el contenido completo como atributo recuperable.

La búsqueda editorial interna será un caso separado, no usará Algolia y se resolverá por un flujo propio de aplicación e infraestructura.

### Decisión sobre data warehouse

No se implementará un data warehouse en las fases actuales. PostgreSQL continúa como fuente transaccional y de reportes operativos iniciales; Algolia sigue siendo un índice de búsqueda derivado, no un warehouse. Para los reportes iniciales se priorizarán consultas controladas, índices, vistas o vistas materializadas sobre PostgreSQL. Si BI/reportes llegan a afectar el primario, podrá evaluarse una réplica de lectura. Un warehouse se reconsiderará solo cuando existan necesidades medibles: múltiples fuentes de datos, Power BI/BI formal, análisis histórico, grandes volúmenes de eventos, consultas analíticas que afecten OLTP, o modelos semánticos/ciencia de datos. La opción futura en Azure podría ser Microsoft Fabric Warehouse, pero no es una dependencia aprobada ni actual.

### Pipeline de ingesta normativa (Fase 1)

La Fase 1 del pipeline puebla la base de datos a partir del resumen mensual del Registro Oficial:

- El resumen mensual es un PDF que contiene títulos, metadata y referencias a la publicación oficial de cada norma, pero no el texto completo.
- El scraping del resumen mensual crea registros iniciales de normas y puede detectar la edición oficial específica. La fuente es `urlPdf` de `EdicionRegistroOficial`, no un campo propio de `Norma`, y una edición puede asociarse a varias normas.
- Los registros iniciales se crean en estado editorial `BORRADOR`.
- Una norma puede publicarse con metadata aprobada aunque todavía no tenga contenido completo.
- Si una norma publicada no tiene contenido completo, el detalle muestra el PDF de la fuente oficial detectada incrustado; el sistema no inventa contenido.
- Las normas se sincronizan automáticamente con Algolia al pasar a `PUBLICADA`, y la búsqueda pública opera sobre metadata.
- El scraping es una función crítica restringida inicialmente al `SUPERADMINISTRADOR`; un `EDITOR` solo puede ejecutarlo si el `SUPERADMINISTRADOR` lo habilita globalmente.
- El detalle de las reglas de esta fase está documentado en `docs/reglas-negocio.md`, sección 13.
- La Fase 5A materializa la entrada de este pipeline en el backend: la ingesta por lote del resumen mensual (`docs/reglas-negocio.md`, sección 14; ADR 0008). El scraper externo sigue siendo futuro; el backend ya acepta, valida, deduplica y persiste sus detecciones como borradores con trazabilidad por ítem.

## Decisiones Clave

Ver [decisiones/](./decisiones/) para el registro de decisiones de arquitectura (ADR).

## Tecnologías

| Capa          | Tecnología (fase 2) | Tecnología (prevista) |
|---------------|---------------------|-----------------------|
| Dominio       | TypeScript puro     | —                     |
| Pruebas       | Jest + ts-jest      | —                     |
| Aplicación    | TypeScript puro     | —                     |
| API           | —                   | NestJS                |
| Persistencia  | —                   | Prisma + PostgreSQL   |
| Cache         | —                   | Redis                 |
| Infraestructura| —                  | Azure                 |

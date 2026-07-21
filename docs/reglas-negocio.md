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

### SUPERADMINISTRADOR inicial (regla operativa, Fase 4E/4F)

- El SUPERADMINISTRADOR inicial no se crea desde ningún endpoint público: antes de existir no hay usuario autenticado que pueda autorizarlo.
- Se aprovisiona con el bootstrap controlado (variables de entorno seguras + confirmación explícita), inicia sesión y **cambia de inmediato su contraseña temporal** con el cambio de contraseña propia; luego las variables sensibles se borran/rotan.
- El seed nunca es mecanismo de producción: solo desarrollo/test con usuarios `@test.com` y contraseña conocida.
- Detalle operativo completo en ADR 0007.

### Cambio de contraseña propia (caso de uso `CambiarContrasenaPropia`, Fase 4F)

- Un usuario autenticado puede cambiar su propia contraseña validando la contraseña actual.
- La nueva contraseña debe cumplir la política mínima (`PoliticaContrasenas`): no vacía tras trim y mínimo 12 caracteres.
- La nueva contraseña debe ser distinta de la actual.
- Usuario inexistente, usuario sin contraseña asignada o contraseña actual incorrecta responden la misma razón `CREDENCIALES_INVALIDAS` (no se revela cuál fue).
- El cambio no emite token nuevo, no cierra sesiones ni revoca tokens (aún no existe modelo de sesión/revocación); los tokens ya emitidos valen hasta expirar.
- Nunca se devuelve ni registra la contraseña o el hash.
- Expuesto por HTTP como `POST /auth/cambiar-contrasena` (Bearer obligatorio; 204 sin cuerpo; 401 genérico para credenciales inválidas; 400 para nueva contraseña inválida o igual a la actual).

### Gestión mínima de usuarios internos (caso de uso `CrearUsuarioSistema`, Fase 4G)

- Un SUPERADMINISTRADOR autenticado puede crear usuarios internos del sistema con roles de negocio existentes: **solo EDITOR y ADMINISTRADOR** en esta fase.
- No se pueden crear SUSCRIPTOR, otros SUPERADMINISTRADOR ni roles dinámicos: los roles siguen definidos por el dominio.
- Ningún otro rol puede crear usuarios (EDITOR/ADMINISTRADOR/SUSCRIPTOR y actores inexistentes reciben acceso denegado).
- El correo del nuevo usuario se normaliza y debe ser único globalmente (`CORREO_YA_REGISTRADO` si ya existe). La unicidad se protege en dos capas (Fase 4H): pre-verificación en aplicación y garantía final de persistencia (UNIQUE de `usuarios.correo_normalizado`); un duplicado concurrente detectado al crear también se traduce a `CORREO_YA_REGISTRADO` (HTTP 409), nunca a un error crudo de infraestructura.
- La contraseña inicial debe cumplir la política mínima (`PoliticaContrasenas`) y se persiste solo como hash scrypt; nunca se devuelve contraseña ni hash.
- El usuario creado puede iniciar sesión de inmediato con su contraseña inicial (y debería cambiarla con el cambio de contraseña propia).
- Expuesto por HTTP como `POST /usuarios/sistema` (Bearer obligatorio; 201 con datos públicos del usuario; 403 actor no autorizado; 409 correo duplicado; 400 solicitud/rol/contraseña inválidos).
- Fuera de alcance en esta fase: listar/editar/desactivar usuarios, cambiar roles, invitaciones, reset administrativo de contraseña y gestión de clientes/suscripciones.

### Regla global diferida

- El correo electrónico identifica globalmente al usuario.
- No pueden existir dos usuarios con el mismo correo normalizado.
- La unicidad global del correo no se garantiza dentro de una entidad `Usuario` aislada. Se implementará en aplicación y persistencia, donde será posible consultar el conjunto de usuarios del sistema.
- En la persistencia Prisma/PostgreSQL inicial, `usuarios.correo_normalizado` tiene una restricción `UNIQUE`.
- La aplicación podrá validar antes de guardar y traducir errores de constraint a errores de negocio, pero la garantía fuerte de unicidad global debe estar en la base de datos.

## 3. Roles del sistema

Los roles globales actuales son:

- `SUPERADMINISTRADOR`.
- `ADMINISTRADOR`.
- `EDITOR`.
- `SUSCRIPTOR`.

Reglas confirmadas:

- `SUPERADMINISTRADOR` puede operar funciones administrativas globales y editoriales.
- `ADMINISTRADOR` puede operar funciones comerciales: cuentas, clientes, usuarios vinculados a cuentas, suscripciones y cupos.
- `ADMINISTRADOR` no puede acceder al flujo editorial de normas.
- `ADMINISTRADOR` no puede crear, modificar, publicar ni gestionar normas.
- `ADMINISTRADOR` no puede crear, leer, modificar ni borrar usuarios desde administración fuera del contexto comercial de la cuenta.
- `EDITOR` puede operar el flujo editorial de normas.
- `EDITOR` puede crear y modificar contenido y metadata normativa.
- `EDITOR` no puede crear, leer, modificar ni borrar cuentas/clientes.
- `EDITOR` no puede crear, leer, modificar ni borrar usuarios desde administración.
- `EDITOR` no puede crear, leer, modificar ni borrar suscripciones.
- `SUSCRIPTOR` no puede modificar normas, cuentas, usuarios ni suscripciones.
- `SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EDITOR` y `SUSCRIPTOR` pueden leer su propia información mínima de sesión/perfil.
- Dueño de cuenta y miembro no son roles globales del sistema.
- Dueño de cuenta y miembro son conceptos internos futuros del cliente/cuenta.
- Los privilegios administrativos completos todavía no están implementados.

### Permisos de scraping

- El scraping es una función crítica.
- En la etapa inicial, ejecutar o gestionar procesos de scraping es una función exclusiva del `SUPERADMINISTRADOR`.
- `SUPERADMINISTRADOR` puede habilitar globalmente a un `EDITOR` para ejecutar o gestionar procesos de scraping.
- Un `EDITOR` no queda habilitado para scraping por el solo hecho de tener el rol global `EDITOR`; requiere habilitación explícita.
- Un `EDITOR` sin habilitación explícita no puede ejecutar ni gestionar scraping.
- El `EDITOR` participa en revisión, corrección, completado editorial y publicación de normas.
- El `EDITOR` puede publicar normas.
- `ADMINISTRADOR` no puede importar, hacer scraping, revisar, enriquecer, publicar ni gestionar normas, porque no participa en el flujo editorial.
- `SUSCRIPTOR` no puede importar, hacer scraping ni modificar normas.

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
- En la persistencia Prisma/PostgreSQL inicial, `suscripcion_correos_habilitados.correo_normalizado` tiene una restricción `UNIQUE`.
- Esta decisión soporta la firma del puerto `RepositorioSuscripciones.buscarPorCorreoHabilitado(correo): Promise<Suscripcion | null>`, que presupone que un correo habilitado resuelve a cero o una sola suscripción.
- La unicidad global del correo habilitado no puede depender solo del dominio, porque una entidad `Suscripcion` no ve todas las suscripciones del sistema al mismo tiempo.
- La aplicación podrá validar antes de guardar y traducir errores de constraint a errores de negocio, pero la garantía fuerte de exclusividad global debe estar en la base de datos.

## 5. Normas

### Reglas vigentes

- Una norma tiene `id`, `numero`, `titulo`, `contenido`, `tipoNorma`, `institucionExpide`, `estadoJuridico`, `estadoEditorial`, `fechaExpedicion`, una FK interna nullable `edicionRegistroOficialId` que representa exclusivamente su edición principal y `fechaPublicacionEnSistema`. Puede tener además cero o más ediciones de cambio en una relación persistente separada.
- `id` no puede estar vacío ni contener únicamente espacios.
- Mientras la norma está en `BORRADOR`, cualquier campo detectable puede estar vacío o nulo: el scraping puede fallar en la detección de todos los campos y el editor los completa después (manualmente o con ayuda posterior de LLM). No se usan placeholders artificiales (`SIN_CLASIFICAR`, `SIN_DETERMINAR`, títulos inventados).
- `titulo`, `tipoNorma` e `institucionExpide` son `string` que pueden quedar vacíos en `BORRADOR`; se normalizan mediante `trim()`.
- `numero` es opcional.
- Si `numero` viene vacío o contiene únicamente espacios, se guarda como `null`.
- Si `numero` viene informado, se normaliza mediante `trim()`.
- `contenido` es un arreglo de textos (`string[]`) y puede estar vacío tanto en `BORRADOR` como en `PUBLICADA`.
- `fechaExpedicion` es opcional (`null`); cuando existe debe ser una fecha válida y no es obligatoria para publicar. Es un **día jurídico**, no un instante: los contratos HTTP aceptan y devuelven exclusivamente `YYYY-MM-DD` (o `null`) en entrada (`POST /normas`, `PATCH /normas/:id`) y en salida (vistas editoriales, detalle y contenido de suscriptor por igual); horas, offsets y fechas imposibles se rechazan. `fechaPublicacionEnSistema` sí es un instante y conserva `DateTime`/timestamp.
- La triple `tipoPublicacionRegistroOficial` + `numeroPublicacionRegistroOficial` + `fechaPublicacionOficial` y la fuente `urlPdf` pertenecen exclusivamente a `EdicionRegistroOficial`. Las vistas pueden proyectarlas, pero `Norma` no las posee.
- `fechaPublicacionOficial` es un día calendario, no un instante: los contratos externos aceptan exclusivamente `YYYY-MM-DD`, aplicación la representa a medianoche UTC y PostgreSQL la persiste como `DATE`. Horas, offsets, formatos flexibles y fechas imposibles se rechazan para que la triple identifique inequívocamente una edición.
- La norma no tiene campo `anio`: año/mes pertenecen al resumen mensual/lote de ingesta (`periodoAnio`, `periodoMes`); si la UI necesita el año, se deriva de las fechas jurídicas.
- `fechaPublicacionEnSistema` debe ser una fecha válida cuando exista.
- Si `estadoEditorial` es `PUBLICADA`, debe existir `fechaPublicacionEnSistema` y los obligatorios de publicación deben estar completos (ver "Obligatorios para publicar").
- Si `estadoEditorial` no es `PUBLICADA`, `fechaPublicacionEnSistema` queda en `null`, aunque se proporcione otro valor al construir la entidad.
- `estaVisibleParaSuscriptores()` devuelve `true` cuando `estadoEditorial` es `PUBLICADA`.
- `estaPublicada()` se mantiene como alias interno de compatibilidad y también depende del flujo editorial, no del estado jurídico.

### Obligatorios para publicar

Para pasar una norma de `BORRADOR` a `PUBLICADA`, `Norma.camposFaltantesParaPublicar()` valida:

- `tipoNorma` (`TIPO_NORMA_REQUERIDO`)
- `titulo` (`TITULO_REQUERIDO`)
- `institucionExpide` (`INSTITUCION_EXPIDE_REQUERIDA`)
- `estadoJuridico` (`ESTADO_JURIDICO_REQUERIDO`)
- asociación a una `EdicionRegistroOficial` (`EDICION_REGISTRO_OFICIAL_REQUERIDA`)

Además, el caso de uso exige que la edición asociada tenga una fuente válida para publicar: `urlPdf` presente y resolución `RESUELTA` o `MANUAL`; en caso contrario retorna `FUENTE_REQUERIDA`. No son obligatorios para publicar `numero`, `fechaExpedicion` ni `contenido`. La publicación individual y la múltiple aplican el mismo contrato.

Estado jurídico actual (`EstadoNorma`):

- `VIGENTE`.
- `REFORMADA`.
- `DEROGADA`.

`ARCHIVADA` no existe como estado jurídico de una norma.

Flujo editorial actual (`EstadoEditorialNorma`):

- `BORRADOR`.
- `EN_REVISION`.
- `PUBLICADA`.

Reglas de visibilidad:

- Cuando el flujo editorial llega a `PUBLICADA`, la norma queda disponible para usuarios con acceso por suscripción activa y vigente que habilita su correo normalizado.
- Una norma en `BORRADOR` no queda disponible para usuarios con acceso por suscripción activa y vigente que habilita su correo normalizado.
- Una norma en `EN_REVISION` no queda disponible para usuarios con acceso por suscripción activa y vigente que habilita su correo normalizado.
- `estaVisibleParaSuscriptores()` se mantiene como nombre técnico del código actual y devuelve `true` cuando la norma queda disponible para usuarios con acceso por suscripción activa y vigente que habilita su correo normalizado.
- Una norma en `PUBLICADA` puede consultarse como contenido completo solo si el usuario autenticado tiene una suscripción activa y vigente que habilita su correo normalizado.
- El estado jurídico `VIGENTE`, `REFORMADA` o `DEROGADA` no bloquea por sí mismo el acceso de usuarios con acceso por suscripción activa y vigente que habilita su correo normalizado.

Reglas de fuente:

- La fuente oficial es `EdicionRegistroOficial.urlPdf`, la URL del PDF de la edición donde está publicada la norma.
- `urlResumenMensualRegistroOficial` NO es la fuente: es la URL del resumen/índice mensual usado para detectar entradas y pertenece al lote de ingesta. Nunca se usa como fallback de `EdicionRegistroOficial.urlPdf`.
- `urlPdf` puede estar en `null` mientras la edición está pendiente de resolución.
- Para publicar, la norma debe estar asociada a una edición con `urlPdf` válida y estado de resolución `RESUELTA` o `MANUAL`.
- La fuente no identifica de forma única a una norma: una misma edición puede contener varias normas.
- No se implementa deduplicación de normas por `urlPdf`.

Reglas de tipo de norma:

- `tipoNorma` puede quedar vacío en `BORRADOR`, es obligatorio para publicar y se normaliza mediante `trim()`.
- `tipoNorma` queda como `string` porque el catálogo normativo ecuatoriano se cerrará en una fase posterior.
- Más adelante puede evolucionar a enum, catálogo o entidad.

Reglas jurídicas confirmadas:

- Si se registra una norma nueva ordinaria y no hay fuente normativa que indique reforma o derogatoria, su estado jurídico debe ser `VIGENTE`.
- Una norma puede registrarse como `REFORMADA` o `DEROGADA` cuando existe sustento normativo en la fuente o metadata de carga.
- La entidad `Norma` no impide construir normas `REFORMADA` o `DEROGADA`, porque el sistema puede cargar normas históricas que ya ingresan con ese estado jurídico.
- Una norma no se deroga ni se reforma por voluntad de un editor o superadministrador.
- Registrar que una norma está `REFORMADA` o `DEROGADA` debe basarse en una norma, fuente o sustento jurídico.
- La validación profunda del sustento normativo para reforma o derogatoria queda diferida a casos de uso o reglas futuras.
- Todavía no se modelan norma reformatoria, norma derogatoria, trazabilidad jurídica ni relaciones entre normas.

### Reglas editoriales confirmadas pero diferidas

- `SUSCRIPTOR` no puede crear, modificar, reformar, derogar ni publicar normas.
- `EDITOR` puede modificar contenido y metadata de normas.
- `SUPERADMINISTRADOR` tiene la misma capacidad editorial que `EDITOR` y además capacidades administrativas.
- `EDITOR` y `SUPERADMINISTRADOR` pueden corregir errores de ingreso sin que eso implique reforma jurídica.
- `EDITOR` y `SUPERADMINISTRADOR` no pueden cambiar arbitrariamente una norma a `DEROGADA` o `REFORMADA` sin sustento normativo.
- La trazabilidad profunda de reformas y derogatorias queda diferida.
- Una norma puede pasar a `PUBLICADA` con metadata aprobada aunque todavía no tenga contenido completo. Esa publicación corresponde a la ficha normativa o metadata aprobada, no a la disponibilidad del texto completo.
- La entidad `Norma` actual permite `contenido` como `string` libre sin validación de no vacío. Esto se mantiene como decisión deliberada para permitir representar normas con metadata aprobada aunque todavía no tengan contenido completo.

### Registro de normas (caso de uso `RegistrarNorma`)

- `RegistrarNorma` existe como caso de uso de aplicación (en `packages/aplicacion`).
- `RegistrarNorma` registra una norma inicial en estado editorial `BORRADOR`.
- `EDITOR` y `SUPERADMINISTRADOR` pueden registrar normas.
- `ADMINISTRADOR` y `SUSCRIPTOR` no pueden registrar normas; reciben `ACCESO_DENEGADO`.
- La autorización se resuelve con la política de aplicación `PoliticaGestionEditorialNorma.puedeRegistrarNormas`, que depende solo de dominio (`Usuario`, `RolUsuario`).
- Registrar permite contenido vacío: una norma con `contenido: []` puede registrarse.
- Si no se informa `estadoJuridico`, la norma se registra como `VIGENTE`. Si se informa `REFORMADA` o `DEROGADA`, se conserva ese valor.
- La triple de edición (`tipoPublicacionRegistroOficial` + `numeroPublicacionRegistroOficial` + `fechaPublicacionOficial`) es **todo o nada**: los tres ausentes registran la norma sin principal (`edicionRegistroOficialId = null` internamente y `edicionesRegistroOficial: []` en HTTP); los tres presentes y válidos crean o reutilizan la `EdicionRegistroOficial` principal. Cualquier triple parcial —o con número no entero positivo o fecha inválida— retorna `SOLICITUD_INVALIDA` sin guardar nada. El número debe ser entero positivo y la fecha un día calendario válido. Registrar nunca fabrica fuente ni URL ficticia, y no crea ediciones de cambio.
- Registrar asigna `estadoEditorial = BORRADOR` y deja `fechaPublicacionEnSistema` en `null`.
- Registrar no publica la norma, no cambia el estado editorial a `PUBLICADA` y no emite el evento `PublicadorEventosNormas`.
- Registrar no sincroniza Algolia ni indexa la norma en la búsqueda pública.
- El id de la norma se genera mediante el puerto de aplicación `GeneradorIds`, que evita acoplar la aplicación a `crypto`, UUID o base de datos. En aplicación no existe adaptador real; en Fase 3A infraestructura provee `GeneradorIdsSecuencial` como adaptador en memoria. En tests de aplicación se usa un fake determinístico.
- Si la solicitud es inválida (campos mínimos vacíos, fechas inválidas o datos inválidos para identificar una edición), retorna `SOLICITUD_INVALIDA` y no guarda nada.
- `RegistrarNorma`, `PublicarNorma` y `ConsultarContenidoNorma` conforman el flujo mínimo actual de aplicación: `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma`.
- Nota técnica (Fase 3A, actualizada en Fases 4A/4B/4E): este flujo se expone por HTTP desde `packages/infraestructura` con NestJS. Desde la Fase 4A la identidad usa `Authorization: Bearer <token>` (JWT firmado) en lugar del header simulado `x-usuario-id`; desde la Fase 4B el token se obtiene con `POST /auth/login` (correo + contraseña verificada contra hash scrypt). El token solo identifica al usuario y los permisos siguen resolviéndose con el `Usuario` del dominio. El SUPERADMINISTRADOR inicial se aprovisiona con el bootstrap operativo de la Fase 4E (script controlado con confirmación explícita; el seed es solo desarrollo/test). No cambia ninguna regla de negocio. Detalle en `docs/arquitectura/vision-arquitectura.md`, ADR 0005, ADR 0006 y ADR 0007.

### Publicación de normas (caso de uso `PublicarNorma`)

- `PublicarNorma` existe como caso de uso de aplicación (en `packages/aplicacion`).
- `EDITOR` y `SUPERADMINISTRADOR` pueden publicar normas.
- `ADMINISTRADOR` y `SUSCRIPTOR` no pueden publicar normas; reciben `ACCESO_DENEGADO`.
- La autorización se resuelve con la política de aplicación `PoliticaGestionEditorialNorma`, que depende solo de dominio (`Usuario`, `RolUsuario`).
- Publicar no exige contenido completo: una norma con `contenido: []` puede publicarse. Tampoco exige `numero` ni `fechaExpedicion`.
- Publicar exige los obligatorios de publicación (ver sección 5); si falta alguno, el caso de uso retorna la razón explícita correspondiente (`TITULO_REQUERIDO`, `FUENTE_REQUERIDA`, etc.) y no publica. En HTTP esas razones responden 409.
- Publicar asigna `fechaPublicacionEnSistema`. Si la solicitud no la entrega, el caso de uso usa la fecha actual.
- Publicar cambia únicamente el estado editorial a `PUBLICADA`; no cambia el estado jurídico.
- La publicación es idempotente respecto a normas ya publicadas: una norma ya `PUBLICADA` retorna `NORMA_YA_PUBLICADA`.
- Existe publicación múltiple (`PublicarNormas`, `POST /normas/publicar` con `normaIds`): mismas reglas y mismos roles que la individual, con semántica parcial. Una norma inválida no bloquea a las demás; la respuesta reporta el resultado por norma (`publicada: true` o `publicada: false` con `razon`: obligatorio faltante, `NORMA_NO_ENCONTRADA`, `NORMA_YA_PUBLICADA` o `NORMA_MODIFICADA_CONCURRENTEMENTE`).
- Al publicar, el caso de uso delega en el puerto de aplicación `UnidadDeTrabajoPublicacionNorma` la persistencia de la norma `PUBLICADA` y el registro del evento de publicación.
- Ese evento representa la señal automática de que una norma fue publicada y habilita la sincronización futura del índice público (Algolia). En este hito solo existe el puerto/evento de aplicación; no se implementa Algolia real, SDK ni adaptador.
- En infraestructura Prisma/PostgreSQL, la publicación usa una transacción para que la norma `PUBLICADA` y el evento se guarden de forma atómica.
- Si falla el guardado de la norma o el registro del evento dentro de esa transacción, no debe quedar una norma `PUBLICADA` sin evento ni un evento sin norma publicada.
- La transición a `PUBLICADA` está condicionada en persistencia a que la norma siga en `BORRADOR` y escribe únicamente `estadoEditorial` y `fechaPublicacionEnSistema`: publicar nunca reescribe título, número, contenido, institución, estado jurídico, fecha de expedición ni edición con la copia leída, por lo que no pisa una corrección editorial concurrente.
- Ante dos publicaciones concurrentes de la misma norma, exactamente una gana; la otra pierde la carrera en la actualización condicionada y la unidad de trabajo lo reporta como resultado tipado que el caso de uso traduce a `NORMA_YA_PUBLICADA` (HTTP 409, nunca un error crudo de infraestructura ni un 500). Queda un solo evento de publicación.
- La validación previa del caso de uso no reemplaza la barrera atómica de persistencia: la transición a `PUBLICADA` exige, en la misma actualización condicionada y sobre el estado persistido vigente, que la norma conserve sus obligatorios de publicación (`tipoNorma`, `titulo`, `institucionExpide`, `estadoJuridico`) y siga asociada a una edición **principal** publicable (`RESUELTA` o `MANUAL` con `urlPdf`). Las ediciones de cambio no bloquean la publicación ni necesitan fuente para que la norma pueda publicarse.
- Si una modificación concurrente (corrección que vacía un obligatorio o cambio hacia una edición no publicable) invalida la publicación después de la validación del caso de uso, la unidad de trabajo devuelve `NORMA_MODIFICADA_CONCURRENTEMENTE` (HTTP 409): la norma permanece en `BORRADOR`, no se crea evento y el cliente debe releer la norma y reintentar. La razón no detalla el campo afectado; esa validación pertenece a dominio/aplicación.
- Una corrección concurrente que deja la norma publicable (por ejemplo, cambia el título por otro válido, o la reasocia a otra edición publicable) no bloquea la publicación: la norma se publica conservando los valores persistidos vigentes y el evento refleja el contenido persistido (no la copia leída por el caso de uso).
- En publicación múltiple, una norma que pierde esa carrera o resulta modificada concurrentemente se reporta individualmente (`publicada: false` con `razon: NORMA_YA_PUBLICADA` o `razon: NORMA_MODIFICADA_CONCURRENTEMENTE`) y las normas restantes continúan procesándose en orden; solo los fallos desconocidos de infraestructura se propagan.
- En infraestructura real, la sincronización con Algolia no debe depender de una llamada directa a Algolia después de guardar la norma.
- La solución aprobada para producción será un patrón outbox transaccional: guardar la norma `PUBLICADA` y registrar el evento pendiente en una outbox dentro de la misma transacción.
- La entrega posterior a Algolia, cola u otro consumidor debe ser asíncrona, reintentable, observable y ejecutada por infraestructura/adaptadores.
- El dominio no debe conocer outbox, colas ni Algolia. La aplicación debe seguir dependiendo de puertos.
- El método de dominio `Norma.publicar(fechaPublicacionEnSistema)` es inmutable: devuelve una nueva instancia `PUBLICADA` conservando id, metadata propia, asociación a la edición, contenido y estado jurídico, sin lógica de autorización ni validación de la triple de la edición.

### Flujo editorial sobre normas en borrador (Fase 5A)

El editor trabaja con Normas en `BORRADOR`; no revisa lotes ni audita el scraping (los lotes son control técnico exclusivo del `SUPERADMINISTRADOR`, sección 14).

- Lista editorial: `ConsultarNormas` / `GET /normas?estadoEditorial=BORRADOR`. Acceso: `EDITOR` y `SUPERADMINISTRADOR`; `ADMINISTRADOR` y `SUSCRIPTOR` reciben 403; sin token, 401. La respuesta es un array JSON estándar de normas, sin total embebido, lotes, métricas ni señales técnicas de ingesta. Cuando una norma nació de ingesta incluye `origenRegistroOficial`. La trazabilidad de publicación se expone únicamente como `edicionesRegistroOficial`: principal primero y cambios por fecha oficial ascendente e ID; una norma sin principal devuelve `[]`. No se exponen `edicionRegistroOficialId`, `fuente`, `fechaPublicacionOficial`, `tipoPublicacionRegistroOficial` ni `numeroPublicacionRegistroOficial` como campos singulares. `estadoResolucionFuente` de la principal se proyecta únicamente mientras la norma está en `BORRADOR`; una norma `PUBLICADA` no lo expone.
- Detalle editorial: `ConsultarNorma` / `GET /normas/:id`. Mismos roles que la lista. Devuelve los datos estándar de la norma más `contenido` y la misma referencia `origenRegistroOficial` del listado cuando corresponde, incluso después de publicar. No expone señales técnicas de ingesta. El contrato de lectura del `SUSCRIPTOR` no incluye `origenRegistroOficial`.
- Corrección: `ActualizarNorma` / `PATCH /normas/:id`. Solo `EDITOR` y `SUPERADMINISTRADOR`, solo normas en `BORRADOR` (una `PUBLICADA` responde `NORMA_NO_EDITABLE`, 409). Permite completar o corregir `tipoNorma`, `numero`, `titulo`, `institucionExpide`, `fechaExpedicion`, `estadoJuridico` y `contenido`. La triple y la fuente se gestionan en `EdicionRegistroOficial`, no por este endpoint. Los campos ausentes del body no cambian; `null` o vacío limpian los campos anulables. Actualizar no publica ni toca datos internos de ingesta.
- La corrección se persiste con una actualización condicionada a que la norma siga en `BORRADOR` y solo escribe los datos editoriales: una corrección basada en una lectura obsoleta nunca revierte una norma publicada concurrentemente (responde `NORMA_NO_EDITABLE`, 409) y el caso de uso nunca devuelve como éxito una proyección que no fue persistida.
- Cambio de principal: `CambiarEdicionNorma` / `PATCH /normas/:id/edicion-registro-oficial`. Solo `EDITOR` y `SUPERADMINISTRADOR`. El body conserva `edicionRegistroOficialId` porque identifica la nueva principal, pero la respuesta usa `edicionesRegistroOficial`. Si la norma no tenía principal, la asigna sin crear un cambio; si ya era la principal, es idempotente; si reemplaza otra, conserva la anterior como `CAMBIO`, retira la nueva de cambios si estaba allí y actualiza la FK de forma atómica. Una norma en `BORRADOR` puede cambiar a cualquier edición existente; una `PUBLICADA` solo a una principal publicable. El cambio se condiciona al estado editorial leído. Todavía no existen endpoints para agregar o retirar cambios ni se modelan norma reformadora, artículos afectados o tipo jurídico de reforma.
- Publicación individual (`POST /normas/:id/publicar`) y múltiple (`POST /normas/publicar`): ver "Publicación de normas".

## 6. Acceso al contenido completo

La política vigente de dominio para decidir el acceso al contenido completo de una norma es `PoliticaAccesoContenidoNorma`. La política `PoliticaAccesoNormaSuscriptor` queda como política heredada marcada con `@deprecated`; conserva la semántica anterior basada en el rol global `SUSCRIPTOR` y delega en `PoliticaAccesoContenidoNorma` después de verificar ese rol.

- Ningún rol global obtiene acceso automático al contenido completo de normas.
- `SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EDITOR` y `SUSCRIPTOR` solo pueden consultar contenido completo como lectores si están autenticados y tienen una suscripción activa y vigente que habilita su correo normalizado.
- El acceso al contenido completo depende de la suscripción activa por correo, no del rol global `SUSCRIPTOR`.
- El rol administrativo o editorial no concede acceso automático al contenido completo.
- La consulta de contenido completo ya existe como el caso de uso de aplicación `ConsultarContenidoNorma` (en `packages/aplicacion`), no como `ConsultarContenidoNormaComoSuscriptor`.
- El estado jurídico `VIGENTE`, `REFORMADA` o `DEROGADA` no bloquea por sí mismo la consulta.
- Una búsqueda pública no concede acceso al contenido completo.
- Al hacer clic en una norma, si el visitante no está autenticado, el sistema debe redirigirlo a login.
- El sistema debe conservar la intención de navegación para volver al detalle solicitado después del login.
- Después del login, el sistema debe validar acceso antes de mostrar el contenido completo.
- Si el usuario está autenticado pero no tiene una suscripción activa y vigente que habilite su correo normalizado, debe mostrarse una pantalla de acceso restringido.

Salida de `ConsultarContenidoNorma`:

- La salida exitosa de `ConsultarContenidoNorma` incluye un indicador `tieneContenidoCompleto: boolean`.
- Si `contenido.length > 0`, entonces `tieneContenidoCompleto = true`.
- Si `contenido.length === 0`, entonces `tieneContenidoCompleto = false`.
- Cuando `tieneContenidoCompleto = false`, el cliente puede usar la principal de `edicionesRegistroOficial` para mostrar el PDF de la fuente oficial. El sistema no inventa ni simula contenido completo.
- Este indicador no crea un nuevo estado editorial ni un nuevo estado de contenido. `PUBLICADA` significa visibilidad editorial, no necesariamente texto completo enriquecido. Una norma `PUBLICADA` puede tener `contenido` vacío.
- `ConsultarContenidoNorma` representa la consulta de contenido visible para cualquier usuario cuya suscripción activa habilite su correo, independientemente del rol global. Devuelve metadata normativa y `edicionesRegistroOficial`: la principal y únicamente cambios `RESUELTA` o `MANUAL` con `urlPdf`. Oculta cambios pendientes, no encontrados, conflictivos o sin URL.
- El contenido no expone campos singulares de edición/fuente, `estadoResolucionFuente`, `origenRegistroOficial`, `fechaPublicacionEnSistema` ni `estadoEditorial`. `ADMINISTRADOR` sin suscripción continúa recibiendo 403.
- `ConsultarContenidoNorma` no expone `fechaPublicacionEnSistema` al suscriptor, porque es metadata interna/editorial/auditoría. Si se necesita exponerla más adelante, será mediante un caso de uso editorial interno separado (por ejemplo `ConsultarNormaEditorial`), no en la consulta de contenido del suscriptor.
- `estadoEditorial` tampoco se expone en la salida de `ConsultarContenidoNorma`.

Límites de esta política:

- La consulta del contenido completo seguirá siendo un caso de uso privado, separado de la búsqueda pública.
- La política no valida sustento jurídico de reformas o derogatorias.
- La política no consulta bases de datos, no busca entidades, no usa HTTP y no depende de infraestructura.
- La política decide únicamente con entidades de dominio ya construidas que recibe como contexto.

## 7. Búsqueda pública, acceso completo y búsqueda editorial

### Búsqueda pública de normas

- La búsqueda de normas es pública.
- La búsqueda pública no requiere autenticación.
- Está disponible desde la home mediante autocomplete.
- Está disponible desde la ruta `/busqueda` mediante lista de resultados.
- La búsqueda pública puede buscar dentro del contenido completo de las normas.
- El contenido completo de la norma no se entrega públicamente.
- Los resultados públicos solo muestran información resumida.
- La búsqueda pública solo incluye normas con `estadoEditorial` igual a `PUBLICADA`.
- Las normas en `BORRADOR` o `EN_REVISION` no aparecen en búsqueda pública.
- La búsqueda pública puede mostrar normas con estado jurídico `VIGENTE`, `REFORMADA` o `DEROGADA`.
- Las normas `REFORMADA` y `DEROGADA` deben mostrarse con una etiqueta visual especial en la interfaz futura.
- Autocomplete e InstantSearch pueden implementarse directamente en frontend con librerías de Algolia.
- La aplicación/backend no necesita duplicar la búsqueda pública como caso de uso tradicional si Algolia resuelve esa experiencia en frontend.

### Autocomplete en home

- La home tendrá búsqueda tipo autocomplete.
- El autocomplete es público.
- El autocomplete muestra máximo 5 resultados.
- Cada resultado del autocomplete muestra solo el título de la norma.
- El autocomplete no entrega contenido completo.
- El autocomplete no muestra metadata extensa.

### Ruta `/busqueda`

- La ruta `/busqueda` es pública.
- Muestra resultados en lista.
- Usa paginación de 10 resultados por página.
- Cada resultado muestra título, estado jurídico y un fragmento breve.
- El fragmento breve debe estar entre 150 y 250 caracteres.
- El fragmento puede provenir de coincidencias dentro del contenido completo.
- El fragmento no debe permitir reconstruir ni acceder al contenido completo de la norma.
- `/busqueda` no será indexable por Google en la primera versión.
- Los filtros en `/busqueda` quedan diferidos para una fase posterior.

### Acceso al contenido completo desde resultados de búsqueda

- Hacer una búsqueda no concede acceso al contenido completo.
- Al hacer clic en una norma, aplica la regla de acceso al contenido completo definida en la sección 6.
- Si el visitante no está autenticado, el sistema debe redirigirlo a login.
- El sistema debe conservar la intención de navegación para volver al detalle solicitado después del login.
- Después del login, el sistema debe validar acceso antes de mostrar el contenido completo.
- Si el usuario está autenticado pero no tiene una suscripción activa y vigente que habilite su correo normalizado, debe mostrarse una pantalla de acceso restringido.

### Algolia como índice derivado

- Algolia será el motor especializado de búsqueda pública.
- Algolia pertenece a infraestructura.
- El dominio no depende de Algolia.
- La aplicación no debe depender directamente del SDK de Algolia.
- La base de datos será la fuente de verdad.
- Algolia será un índice derivado.
- Algolia puede indexar el contenido completo de las normas para permitir búsqueda textual.
- El contenido completo indexado no debe ser recuperable públicamente como respuesta de búsqueda.
- El índice público debe devolver únicamente los campos aprobados para autocomplete o `/busqueda`.
- El backend no debe exponer el contenido completo como atributo recuperable del índice público.
- La forma técnica de evitar exposición del contenido completo se definirá cuando se implemente el adaptador de Algolia.

### Sincronización con Algolia

- Las normas `PUBLICADA` se sincronizan automáticamente con Algolia.
- La indexación en Algolia ocurre automáticamente cuando una norma cambia a estado editorial `PUBLICADA`.
- Solo las normas `PUBLICADA` deben aparecer en la búsqueda pública.
- Una norma en `BORRADOR` no aparece en búsqueda pública ni se sincroniza con Algolia.
- Las normas en `BORRADOR` o `EN_REVISION` no están disponibles en el índice público.
- Una norma publicada sin contenido completo sí puede aparecer en búsqueda pública porque las normas también se buscan por metadata.
- Si no existe contenido completo, el snippet de búsqueda debe basarse en metadata.
- La sincronización futura con Algolia debe resolverse mediante eventos de aplicación y outbox transaccional o un mecanismo equivalente con garantía transaccional, no mediante acoplamiento directo entre publicación y SDK de Algolia.
- La publicación de una norma no debe quedar acoplada al estado operativo de Algolia. Si Algolia, una cola o un worker fallan, la recuperación debe ocurrir mediante reintentos observables sobre eventos pendientes.

### Búsqueda editorial interna

- Existirá una búsqueda editorial interna separada.
- La búsqueda editorial interna no usa Algolia.
- La búsqueda editorial interna requiere rol `EDITOR` o `SUPERADMINISTRADOR`.
- La búsqueda editorial interna puede incluir normas en `BORRADOR`, `EN_REVISION` o `PUBLICADA`.
- `ADMINISTRADOR` no tiene búsqueda interna de normas.
- `ADMINISTRADOR` queda limitado a funciones comerciales: cuentas, clientes, suscripciones y cupos.
- La búsqueda editorial interna se implementará como caso de uso separado en una fase posterior.

## 8. Gestión de cuentas, usuarios y suscripciones

Las siguientes reglas están confirmadas, pero todavía no están implementadas:

- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden crear cuentas/clientes.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden modificar cuentas/clientes.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden crear, modificar y administrar usuarios vinculados a cuentas.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden crear suscripciones.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden modificar suscripciones.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` pueden definir o modificar `cantidadMaximaUsuarios`.
- `EDITOR` no puede crear, leer, modificar ni borrar cuentas/clientes.
- `EDITOR` no puede crear, leer, modificar ni borrar usuarios desde administración.
- `EDITOR` no puede crear, leer, modificar ni borrar suscripciones.
- El dueño de cuenta no puede crear la cuenta inicial.
- El dueño de cuenta no puede crear la suscripción inicial.
- El dueño de cuenta no puede modificar la suscripción.
- Los miembros no pueden crear ni modificar cuentas/clientes.
- Los miembros no pueden crear ni modificar suscripciones.
- Estas reglas se implementarán en la Fase 2 o en una fase posterior mediante casos de uso y, cuando corresponda, políticas de aplicación o dominio.
- La posibilidad futura de que el dueño de cuenta gestione miembros de su cuenta, si se aprueba, será una regla separada y no equivale a modificar la suscripción.

## 9. Reglas globales diferidas

Las siguientes reglas requieren consultar el estado global del sistema:

- No pueden existir dos usuarios con el mismo correo normalizado.
- Un correo no puede estar habilitado en más de una suscripción.
- Solo los roles autorizados pueden crear o modificar cuentas/clientes y suscripciones, y definir o modificar `cantidadMaximaUsuarios`.
- La validación profunda del sustento jurídico de reformas y derogatorias requiere consultar normas, fuentes o metadata externa al agregado.

Estas reglas no pueden garantizarse correctamente dentro de una entidad aislada. Se implementarán mediante casos de uso, puertos de repositorio y persistencia. Las entidades seguirán protegiendo únicamente sus invariantes locales.

En la persistencia Prisma/PostgreSQL inicial, la unicidad global de correos queda respaldada por constraints de base de datos:

- `usuarios.correo_normalizado` debe ser `UNIQUE`.
- `suscripcion_correos_habilitados.correo_normalizado` debe ser `UNIQUE`.

Estas restricciones evitan estados ambiguos que la aplicación no podría resolver de forma confiable después de ocurridos. En particular, soportan que `RepositorioSuscripciones.buscarPorCorreoHabilitado(correo)` retorne `Promise<Suscripcion | null>` y no una lista de suscripciones.

## 10. Límites explícitos del modelo actual

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
- Catálogo normativo para `tipoNorma`.
- Entidad `Institucion`.
- Entidad `Fuente`.
- Vigencia normativa con trazabilidad jurídica completa.
- Jurisdicción.
- Relaciones de reforma o derogatoria entre normas.
- Auditoría funcional del sistema.
- Autenticación.
- Autorización administrativa completa.

## 11. Relación entre reglas, tests y código

| Área | Documento humano | Tests ejecutables | Código que aplica la regla |
|---|---|---|---|
| Usuarios | `docs/reglas-negocio.md` | `packages/dominio/src/usuarios/__tests__/Usuario.test.ts` | `packages/dominio/src/usuarios/entidades/Usuario.ts` |
| Suscripciones | `docs/reglas-negocio.md` | `packages/dominio/src/suscripciones/__tests__/Suscripcion.test.ts` | `packages/dominio/src/suscripciones/entidades/Suscripcion.ts` |
| Normas | `docs/reglas-negocio.md` | `packages/dominio/src/normas/__tests__/Norma.test.ts` | `packages/dominio/src/normas/entidades/Norma.ts` |
| Acceso a normas (vigente) | `docs/reglas-negocio.md` | `packages/dominio/src/normas/__tests__/PoliticaAccesoContenidoNorma.test.ts` | `packages/dominio/src/normas/politicas/PoliticaAccesoContenidoNorma.ts` |
| Acceso a normas (heredado) | `docs/reglas-negocio.md` | `packages/dominio/src/normas/__tests__/PoliticaAccesoNormaSuscriptor.test.ts` | `packages/dominio/src/normas/politicas/PoliticaAccesoNormaSuscriptor.ts` |
| Validaciones compartidas | `docs/reglas-negocio.md` | `packages/dominio/src/compartido/validaciones/__tests__/texto.test.ts` | `packages/dominio/src/compartido/validaciones/texto.ts` |

Nota: `PoliticaAccesoContenidoNorma` y sus tests representan la regla vigente de acceso al contenido completo. `PoliticaAccesoNormaSuscriptor` se conserva como política heredada (`@deprecated`) por compatibilidad; mantiene la semántica anterior basada en el rol global `SUSCRIPTOR` y delega en `PoliticaAccesoContenidoNorma`. La evolución a la regla independiente del rol `SUSCRIPTOR` ya ocurrió en dominio: el acceso se basa en usuario autenticado, correo habilitado y suscripción activa y vigente.

## 12. Procedimiento para cambiar una regla

1. Actualizar `docs/reglas-negocio.md`.
2. Actualizar o crear el test que exprese la nueva regla.
3. Modificar la entidad, política o caso de uso correspondiente.
4. Ejecutar `npm run typecheck`.
5. Ejecutar `npm test`.
6. Ejecutar `npm run build`.
7. Limpiar los artefactos con `rm -rf packages/dominio/dist packages/aplicacion/dist`.
8. Verificar la ausencia de `dist` y `coverage` con el comando acordado para el monorepo.
9. Hacer un commit pequeño y descriptivo.

## 13. Pipeline de ingesta normativa (Fase 1)

Esta sección documenta únicamente la Fase 1 del pipeline de ingesta normativa: el poblamiento inicial de la base de datos a partir del resumen mensual del Registro Oficial. Nada de lo descrito aquí está implementado todavía en dominio o aplicación.

### Resumen mensual como fuente inicial de poblamiento

- El flujo inicial de poblamiento normativo puede iniciar con una URL de PDF del resumen mensual del Registro Oficial.
- El resumen mensual sirve para empezar a poblar la base de datos.
- El resumen mensual contiene títulos, metadata y referencias a la publicación oficial donde se encuentra cada norma.
- El resumen mensual no contiene el texto completo de cada norma.
- La importación desde el resumen mensual crea registros iniciales de normas.
- Los registros iniciales se crean en estado editorial `BORRADOR`.

### Fuente oficial específica

- El scraping del resumen mensual detecta y asigna la fuente oficial específica de cada norma.
- La fuente oficial específica puede ser Registro Oficial, suplemento, edición especial u otra publicación oficial.
- La `fuente` de la norma debe ser la fuente oficial específica detectada desde el resumen mensual.
- Un mismo resumen mensual puede originar varias normas.
- Un mismo PDF fuente oficial puede contener varias normas.
- Por tanto, `fuente` no debe asumirse única.

### Publicación de metadata sin contenido completo

- Una norma detectada por scraping puede pasar a `PUBLICADA` aunque todavía no tenga contenido completo.
- Esta publicación corresponde a la ficha normativa o metadata aprobada.
- La publicación sin contenido completo permite que el suscriptor abra el detalle y vea la metadata publicada.
- Si la norma publicada aún no tiene contenido completo, el sistema debe mostrar el PDF incrustado de la fuente oficial detectada.
- El sistema no debe inventar ni simular contenido completo.
- La regla relevante en esta fase es operativa: puede existir metadata publicada antes de enriquecer el contenido.

### Búsqueda pública y Algolia

- Las normas `PUBLICADA` se sincronizan automáticamente con Algolia.
- La indexación en Algolia ocurre automáticamente cuando una norma cambia a estado editorial `PUBLICADA`.
- Solo las normas `PUBLICADA` deben aparecer en la búsqueda pública.
- Una norma en `BORRADOR` no aparece en búsqueda pública ni se sincroniza con Algolia.
- Una norma publicada sin contenido completo sí puede aparecer en búsqueda pública porque las normas también se buscan por metadata.
- Si no existe contenido completo, el snippet de búsqueda debe basarse en metadata.

### Roles y permisos

- El scraping es una función crítica.
- Inicialmente, solo `SUPERADMINISTRADOR` puede ejecutar o gestionar scraping.
- El `SUPERADMINISTRADOR` puede habilitar globalmente a un `EDITOR` para ejecutar o gestionar scraping.
- Un `EDITOR` no queda habilitado para scraping solo por tener rol global `EDITOR`; requiere habilitación explícita.
- El `EDITOR` participa en revisión, corrección, completado editorial y publicación.
- El `EDITOR` puede publicar normas.
- `ADMINISTRADOR` no puede importar, hacer scraping, revisar, enriquecer, publicar ni gestionar normas.
- `SUSCRIPTOR` no puede importar, hacer scraping ni modificar normas.

### Relación con el modelo actual

- La entidad `Norma` actual permite `contenido` como `string` libre.
- Esto permite representar normas con metadata aprobada aunque todavía no tengan contenido completo.
- No se agregan nuevos estados editoriales en esta fase. Se mantienen `BORRADOR`, `EN_REVISION` y `PUBLICADA`.
- La diferencia importante para esta fase no es un nuevo estado de contenido, sino la separación operativa entre:
  - el scraping del resumen mensual para metadata y fuente oficial;
  - el enriquecimiento posterior del contenido desde la fuente oficial.

El enriquecimiento del contenido completo desde la fuente oficial específica corresponde a una fase posterior y no se documenta en detalle en este hito.

## 14. Ingesta por lote del Registro Oficial (Fase 5A)

Esta sección documenta la ingesta implementada en la Fase 5A: el backend recibe de un extractor externo el lote mensual de entradas ya detectadas desde el resumen/índice del Registro Oficial y crea normas en `BORRADOR`. No implementa scraping real, parser de PDF, LLM, OCR, colas ni curaduría editable. Detalle arquitectónico en ADR 0008.

### Endpoint y autorización

Los lotes y sus endpoints son control técnico del proceso de scraping (idempotencia, trazabilidad): son exclusivos del `SUPERADMINISTRADOR`. El flujo editorial vive en `/normas` y se documenta en la sección 5; el editor no navega por lotes.

- `POST /ingesta/registro-oficial/resumenes` recibe el lote; exige Bearer.
- Solo `SUPERADMINISTRADOR` puede ejecutar la ingesta (caso de uso `IngerirResumenRegistroOficial`, política `PoliticaIngestaRegistroOficial`).
- `EDITOR`, `ADMINISTRADOR`, `SUSCRIPTOR` y actores inexistentes reciben acceso denegado (403 genérico, sin pistas).
- Solo `SUPERADMINISTRADOR` puede consultar lotes (`GET /ingesta/registro-oficial/lotes`) y un lote completo con sus entradas (`GET /ingesta/registro-oficial/lotes/:id`). `EDITOR`, `ADMINISTRADOR` y `SUSCRIPTOR` reciben 403. Solo lectura: sin edición, sin descarte, sin fusión, sin resolver duplicados y sin publicar.

### Lote

- El lote representa un resumen mensual completo del Registro Oficial con: `id`, `huellaLote`, `periodoAnio`, `periodoMes`, `fechaEjecucion`, `urlResumenMensualRegistroOficial`, `versionExtractor` y `entradasDetectadas`.
- El lote no tiene `fuente`: el endpoint ya es específico de Registro Oficial.
- El lote no persiste `creadoPorUsuarioId`: por ahora solo existe un SUPERADMINISTRADOR operativo y no se implementa auditoría parcial de creador.
- El lote no persiste métricas. Las respuestas derivan únicamente `totalEntradasDetectadas` y `totalConAdvertencias` desde sus entradas.
- Límite operativo inicial: entre 1 y 1500 entradas detectadas. El máximo es configurable en infraestructura; un lote vacío responde `SOLICITUD_INVALIDA` y uno que exceda el máximo responde `LIMITE_ENTRADAS_INGESTA_EXCEDIDO` (HTTP 413).
- El extractor acumula el resumen mensual completo y realiza un único envío cuando termina. No existen partes, estados de ejecución ni tablas de staging en esta fase.
- El `POST` responde un resumen del lote y `creado`; las entradas completas se consultan mediante `GET /ingesta/registro-oficial/lotes/:id`.
- Las posiciones de las entradas deben ser enteros no negativos y únicos dentro del lote; si no, el lote completo es inválido (error estructural del extractor).

### Idempotencia

- Se calcula y persiste una `huellaLote` estable del contenido (servicio puro `CalculadoraHuellaLote`; no depende del orden de claves ni del orden de llegada de entradas).
- La huella incluye período, `urlResumenMensualRegistroOficial`, `versionExtractor` y entradas detectadas.
- Solo puede existir un lote por `periodoAnio` + `periodoMes`; PostgreSQL impone la garantía con un `UNIQUE` compuesto.
- Mismo período + misma huella: devuelve el resumen del lote mensual existente con `creado: false`, sin crear normas nuevas.
- Mismo período + huella distinta: `EJECUCION_INGESTA_CONFLICTIVA` (HTTP 409); una corrección del resumen requerirá en el futuro un flujo explícito, nunca sobrescritura automática.
- La garantía fuerte ante carreras es el `UNIQUE` de (`periodo_anio`, `periodo_mes`); el conflicto concurrente se re-resuelve con la misma semántica de idempotencia.

### Entradas detectadas

- Cada entrada conserva la trazabilidad necesaria: `id`, `posicion`, `normaId`, `segmentoCrudo`, `metadataExtraccion`, `advertencias`, `confianza` y `fechaCreacion`.
- La entrada no duplica un campo `anio`: el año y el mes identifican al lote mediante `periodoAnio` y `periodoMes`, mientras que `publicacion.fecha` representa la fecha exacta detectada de la edición oficial.
- La ingesta no descarta entradas detectadas: cada una origina una `Norma` en `BORRADOR`.
- Prisma puede conservar `loteId` y campos auxiliares de detección como detalles relacionales; HTTP expone las entradas anidadas dentro del lote.

### Resultado derivado de detección

- Cada entrada consultada incluye `resultadoDeteccion`, derivado y no persistido como estado editorial.
- `ENTRADA_CON_ADVERTENCIAS`: si la entrada contiene al menos una advertencia.
- `ENTRADA_DETECTADA`: si no contiene advertencias.
- Todas las normas creadas por ingesta nacen en `BORRADOR` y pasan por el flujo editorial; no se agrega otra señal redundante para indicar esa revisión.

### Creación de normas

- Toda entrada detectada crea una `Norma` en estado editorial `BORRADOR`, incluso si el scraping falló en la detección de todos los campos. La ingesta nunca publica; no existe estado `DETECTADA`.
- `estadoJuridico` nace `VIGENTE` por defecto.
- Los campos propios de `Norma` no detectados quedan vacíos o nulos según su tipo, sin placeholders artificiales: título no detectado → `titulo` vacío; tipo no detectado → `tipoNorma` vacío; institución no detectada → `institucionExpide` vacía. La entrada del lote conserva advertencias de trazabilidad (`TITULO_NO_DETECTADO`, `INSTITUCION_NO_DETECTADA`, `EDICION_REGISTRO_OFICIAL_NO_DETERMINADA`, etc.), pero esas señales no se copian a la norma.
- `urlResumenMensualRegistroOficial` nunca se usa como fuente oficial. El extractor mensual no envía ni detecta la URL del PDF fuente. Cuando la entrada contiene la triple completa se crea o reutiliza una `EdicionRegistroOficial`: una edición nueva nace con `urlPdf = null`, mientras una edición preexistente conserva la fuente que ya tuviera resuelta o corregida. La ingesta la asocia exclusivamente como principal; no crea asociaciones de cambio. La FK singular se mantiene interna y las respuestas usan la colección canónica `edicionesRegistroOficial`.
- `fechaExpedicion` no se infiere: queda `null` hasta que el editor la complete.
- El contenido queda vacío: el enriquecimiento con texto completo y metadata jurídica adicional es de fases posteriores.
- El editor rellena los campos faltantes desde el flujo editorial (`GET /normas?estadoEditorial=BORRADOR`, `GET /normas/:id`, `PATCH /normas/:id`) y publica cuando la norma cumple los obligatorios de publicación.
- El catálogo interno de `EdicionRegistroOficial` no equivale a una integración
  con el catálogo oficial externo. Mientras esa integración no esté
  configurada, `POST /ediciones-registro-oficial/resolver-pendientes` responde
  `503 CATALOGO_NO_DISPONIBLE` al `SUPERADMINISTRADOR` y no modifica ninguna
  edición. En particular, no fabrica URLs y no convierte la ausencia de
  integración en `NO_ENCONTRADA`.

### Alcance de la detección

- La fecha de publicación detectada por el extractor es el ancla que delimita cada entrada del resumen mensual; cada entrada crea una `Norma` en `BORRADOR`.
- La ingesta no compara cada entrada contra las normas existentes ni analiza posibles duplicados. La unicidad operativa se protege en el nivel correcto: un único lote por período mensual e idempotencia mediante `huellaLote`.
- Si en el futuro la operación demuestra la necesidad de deduplicación jurídica, se diseñará como un proceso editorial separado; no forma parte de la ingesta masiva de Fase 5A.

### Fuera de alcance (Fase 5A)

Scraping real, parser PDF, descarga de índice, scraper WordPress/AJAX, integración con el catálogo oficial externo, resolución automática real de `fuente`, BullMQ/Redis, LLM, OCR, frontend, descarte, fusión, resolver duplicados, publicar automáticamente, roles dinámicos, gestión comercial y auditoría administrativa formal. El catálogo interno de `EdicionRegistroOficial`, la corrección editorial y la publicación (individual y múltiple) sí están implementados; la resolución automática permanece indisponible de forma explícita hasta incorporar un adaptador oficial.

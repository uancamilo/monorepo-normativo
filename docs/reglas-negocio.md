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

## 5. Normas

### Reglas vigentes

- Una norma tiene `id`, `numero`, `titulo`, `contenido`, `tipoNorma`, `institucionExpide`, `fuente`, `estadoJuridico`, `estadoEditorial`, `fechaExpedicion`, `fechaPublicacionOficial` y `fechaPublicacionEnSistema`.
- `id` no puede estar vacío ni contener únicamente espacios.
- `titulo` no puede estar vacío ni contener únicamente espacios.
- `tipoNorma` no puede estar vacío ni contener únicamente espacios.
- `institucionExpide` no puede estar vacía ni contener únicamente espacios.
- `fuente` no puede estar vacía ni contener únicamente espacios.
- `fuente` debe ser una URL válida.
- `id`, `titulo`, `tipoNorma`, `institucionExpide` y `fuente` se normalizan mediante `trim()`.
- `numero` es opcional.
- Si `numero` viene vacío o contiene únicamente espacios, se guarda como `null`.
- Si `numero` viene informado, se normaliza mediante `trim()`.
- `contenido` sigue siendo un `string` libre en el modelo actual y no tiene validaciones de dominio adicionales.
- `fechaExpedicion` debe ser una fecha válida.
- `fechaPublicacionOficial` debe ser una fecha válida.
- `fechaPublicacionOficial` puede ser igual o posterior a `fechaExpedicion`.
- `fechaPublicacionOficial` no puede ser anterior a `fechaExpedicion`.
- `fechaPublicacionEnSistema` debe ser una fecha válida cuando exista.
- Si `estadoEditorial` es `PUBLICADA`, debe existir `fechaPublicacionEnSistema`.
- Si `estadoEditorial` no es `PUBLICADA`, `fechaPublicacionEnSistema` queda en `null`, aunque se proporcione otro valor al construir la entidad.
- `estaVisibleParaSuscriptores()` devuelve `true` cuando `estadoEditorial` es `PUBLICADA`.
- `estaPublicada()` se mantiene como alias interno de compatibilidad y también depende del flujo editorial, no del estado jurídico.

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

- `fuente` es obligatoria y debe ser una URL válida.
- `fuente` no identifica de forma única a una norma.
- Un mismo PDF o URL del Registro Oficial puede contener varias normas.
- Varias normas pueden compartir la misma `fuente`.
- No se implementa deduplicación por `fuente`.

Reglas de tipo de norma:

- `tipoNorma` es obligatorio y se normaliza mediante `trim()`.
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

## 6. Acceso al contenido completo

La política vigente de dominio para decidir el acceso al contenido completo de una norma es `PoliticaAccesoContenidoNorma`. La política `PoliticaAccesoNormaSuscriptor` queda como política heredada marcada con `@deprecated`; conserva la semántica anterior basada en el rol global `SUSCRIPTOR` y delega en `PoliticaAccesoContenidoNorma` después de verificar ese rol.

- Ningún rol global obtiene acceso automático al contenido completo de normas.
- `SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EDITOR` y `SUSCRIPTOR` solo pueden consultar contenido completo como lectores si están autenticados y tienen una suscripción activa y vigente que habilita su correo normalizado.
- El acceso al contenido completo depende de la suscripción activa por correo, no del rol global `SUSCRIPTOR`.
- El rol administrativo o editorial no concede acceso automático al contenido completo.
- La consulta de contenido completo debe modelarse como el caso de uso futuro `ConsultarContenidoNorma`, no como `ConsultarContenidoNormaComoSuscriptor`.
- El estado jurídico `VIGENTE`, `REFORMADA` o `DEROGADA` no bloquea por sí mismo la consulta.
- Una búsqueda pública no concede acceso al contenido completo.
- Al hacer clic en una norma, si el visitante no está autenticado, el sistema debe redirigirlo a login.
- El sistema debe conservar la intención de navegación para volver al detalle solicitado después del login.
- Después del login, el sistema debe validar acceso antes de mostrar el contenido completo.
- Si el usuario está autenticado pero no tiene una suscripción activa y vigente que habilite su correo normalizado, debe mostrarse una pantalla de acceso restringido.

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

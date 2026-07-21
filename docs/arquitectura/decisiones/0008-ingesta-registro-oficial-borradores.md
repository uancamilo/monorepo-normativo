# ADR 0008: Ingesta por lote del Registro Oficial en borradores

## Estado

Aceptada

## Contexto

La Fase 1 del pipeline de ingesta (ADR 0002, `docs/reglas-negocio.md` sección
13) definió que el poblamiento inicial parte del resumen/índice mensual del
Registro Oficial y crea normas en `BORRADOR`. Hasta la Fase 4H no existía
ningún mecanismo de ingesta: cada norma se registraba manualmente con
`POST /normas`.

La Fase 5A no implementa scraping real. Recibe un lote mensual ya generado por
un extractor externo. Ese lote contiene entradas detectadas desde el
resumen/índice mensual; cada entrada detectada debe crear una `Norma` en estado
editorial `BORRADOR`. No existen entradas detectadas rechazadas en esta fase:
el descarte, la fusión y la resolución de duplicados quedan para fases
posteriores.

La fase separa dos planos con actores distintos:

- **Ingesta/scraping (control técnico)**: lotes, idempotencia y trazabilidad
  del proceso. Solo `SUPERADMINISTRADOR` ingiere y consulta lotes.
- **Flujo editorial**: el editor no revisa lotes ni audita el scraping;
  trabaja con Normas en `BORRADOR` (lista, detalle, corrección y publicación
  individual o múltiple). Acceden `EDITOR` y `SUPERADMINISTRADOR`.

## Decisión

La Fase 5A implementa la ingesta por lote desde el resumen mensual del Registro
Oficial con este modelo:

- **Lote como agregado principal**: el lote conserva `id`, `huellaLote`,
  `periodoAnio`, `periodoMes`, `fechaEjecucion`,
  `urlResumenMensualRegistroOficial`, `versionExtractor` y
  `entradasDetectadas`. No persiste `fuente`, creador ni métricas; el endpoint
  ya es específico de Registro Oficial y por ahora no se implementa auditoría
  parcial de usuario creador.
- **Entradas detectadas anidadas**: la aplicación y HTTP usan el lenguaje
  `EntradaDetectadaRegistroOficial` / `entradasDetectadas`. Prisma conserva
  `loteId` como detalle relacional, pero las respuestas exponen las entradas
  anidadas dentro del lote. Las entradas no duplican un campo `anio`: el
  período anual/mensual pertenece al lote y la fecha exacta detectada pertenece
  a `publicacion.fecha`.
- **Sin rechazos por entrada y sin placeholders**: toda entrada detectada crea
  una `Norma` en `BORRADOR`, incluso si el scraping falló en todos los campos.
  Los campos no detectados quedan vacíos o nulos según su tipo (nada de
  `SIN_CLASIFICAR`, `SIN_DETERMINAR` ni títulos inventados); la entrada del
  lote conserva advertencias de trazabilidad y no introduce un estado
  operativo que compita con `Norma.estadoEditorial`.
- **La fuente es el PDF de la edición, no el resumen**:
  `urlResumenMensualRegistroOficial` es la URL del índice mensual usada para
  detectar entradas y vive en el lote. La fuente oficial es `urlPdf` de
  `EdicionRegistroOficial`, nunca un campo propio de `Norma`; si no está
  resuelta, queda `null` (sin usar la URL del resumen como fallback). Varias
  normas pueden asociarse a la misma edición.
- **Principal y ediciones de cambio**: la FK nullable de `Norma` representa
  exclusivamente la edición principal. Una tabla intermedia explícita conserva
  cero o más ediciones de cambio, con unicidad por norma/edición. Las respuestas
  proyectan una colección `edicionesRegistroOficial` (principal primero;
  cambios por fecha oficial e ID) y no exponen la FK ni campos singulares. Al
  reemplazar la principal, la anterior se conserva como cambio y la nueva se
  retira de los cambios en una transacción. La publicación depende solo de la
  principal; la ingesta crea únicamente la principal.
- **Fecha oficial como día calendario**: `fechaPublicacionOficial` no es un
  instante. Los contratos HTTP y del extractor aceptan únicamente
  `YYYY-MM-DD`; aplicación la normaliza a medianoche UTC y PostgreSQL la
  almacena como `DATE`, evitando que horas u offsets produzcan dos triples
  para una misma edición.
- **Norma en borrador con campos opcionales**: el dominio permite `titulo`,
  `tipoNorma`, `institucionExpide`, `estadoJuridico` y `fechaExpedicion`
  vacíos/nulos en `BORRADOR`; `camposFaltantesParaPublicar()` exige únicamente
  los requisitos editoriales propios y la asociación a una edición.
  `fechaExpedicion` no es obligatoria. La triple y la fuente pertenecen a
  `EdicionRegistroOficial`; `Norma` no tiene `anio` (año/mes pertenecen al lote).
- **Resultado derivado**: cada entrada consultada devuelve
  `resultadoDeteccion`, derivado y no persistido:
  `ENTRADA_CON_ADVERTENCIAS` si existen advertencias y
  `ENTRADA_DETECTADA` en caso contrario. Todas las normas creadas por ingesta
  pasan por el flujo editorial, por lo que no se mantiene una señal redundante
  de revisión.
- **Solo BORRADOR, nunca publicación automática**: la ingesta nunca publica,
  no indexa y no sincroniza sistemas externos. El enriquecimiento del texto
  completo queda para fases posteriores.
- **Un único envío completo por período e idempotencia por `huellaLote`**: el
  extractor acumula todas las entradas del resumen y envía una vez al terminar,
  con máximo operativo inicial de 1500 entradas configurable en infraestructura.
  No se modelan partes, estados de ejecución ni staging. La huella es un hash
  estable del contenido del lote (período, URL del resumen mensual,
  `versionExtractor` y entradas detectadas, ordenadas por posición). Solo existe
  un lote por (`periodoAnio`, `periodoMes`). El mismo período con la misma huella
  devuelve el resumen anterior con `creado: false`, sin crear normas; con huella
  distinta responde `EJECUCION_INGESTA_CONFLICTIVA` (409). El UNIQUE de la pareja
  (`periodo_anio`, `periodo_mes`) es la garantía fuerte ante carreras. El POST no
  devuelve las entradas; el detalle completo se consulta por `GET /lotes/:id`.
- **Sin detección de duplicados por entrada**: la fecha de publicación es el
  ancla del extractor y cada entrada detectada crea una `Norma` en `BORRADOR`.
  La ingesta no consulta normas anteriores ni compara las entradas del lote;
  una deduplicación jurídica futura sería un proceso editorial separado.
- **Consulta técnica de lotes solo para superadmin**:
  `GET /ingesta/registro-oficial/lotes` devuelve resúmenes con métricas
  derivadas (`totalEntradasDetectadas`, `totalConAdvertencias`) y
  `GET /ingesta/registro-oficial/lotes/:id` devuelve el lote completo con
  `entradasDetectadas` anidadas. Solo `SUPERADMINISTRADOR` ingiere y consulta
  lotes; `EDITOR`, `ADMINISTRADOR` y `SUSCRIPTOR` reciben 403.
- **Contrato editorial sobre `/normas`**: el editor revisa borradores con
  `GET /normas?estadoEditorial=BORRADOR` (array estándar, sin total embebido y
  sin señales técnicas de ingesta). Tanto el listado como el detalle
  `GET /normas/:id` incluyen `origenRegistroOficial` con
  `urlResumenMensualRegistroOficial` y `segmentoCrudo` cuando la norma nació
  de ingesta, en estado `BORRADOR` o `PUBLICADA`; el detalle agrega
  `contenido`. `estadoResolucionFuente` se proyecta en normas `BORRADOR`, pero
  se omite en normas `PUBLICADA`; el catálogo de ediciones sigue siendo dueño
  de ese estado. El origen es trazabilidad editorial y no se expone al
  `SUSCRIPTOR`. El editor corrige con
  `PATCH /normas/:id` (solo `BORRADOR`) y publica con
  `POST /normas/:id/publicar` o `POST /normas/publicar` (múltiple, parcial:
  una norma inválida no bloquea a las demás y se reporta por norma).
- **Persistencia atómica**: el puerto
  `RepositorioIngestaRegistroOficial.guardarIngesta` persiste lote + entradas +
  normas borrador como unidad (transacción Prisma; equivalente en memoria).
- **Concurrencia editorial sin columna de versión (estabilización de Fase
  5A)**: las carreras entre corrección, cambio de edición y publicación se
  resuelven con escrituras condicionadas al estado editorial, no con un campo
  `version`. La corrección solo aplica si la norma sigue en `BORRADOR` y
  escribe únicamente datos editoriales; el cambio de edición escribe solo la
  FK bajo el estado esperado (una `PUBLICADA` exige edición `RESUELTA` o
  `MANUAL` con `urlPdf`); la publicación cambia solo `estadoEditorial` y
  `fechaPublicacionEnSistema`, con el evento en la misma transacción, y una
  doble publicación produce un éxito y un `NORMA_YA_PUBLICADA` tipado (nunca
  un `P2002` crudo). La validación previa del caso de uso no reemplaza la
  barrera atómica: la transición a `PUBLICADA` exige además, en la misma
  actualización condicionada, que la norma conserve sus obligatorios de
  publicación y siga asociada a una edición publicable; una modificación
  concurrente que invalida la publicación devuelve
  `NORMA_MODIFICADA_CONCURRENTEMENTE` (409), no crea evento y la norma
  permanece en `BORRADOR`, mientras que una corrección concurrente válida se
  conserva y el evento refleja el contenido persistido vigente. Los
  adaptadores memoria y Prisma comparten esta semántica (memoria restaura la
  norma anterior si falla la emisión del evento) y los conflictos esperados
  son resultados discriminados de aplicación, no excepciones.
- **Visibilidad de cambios**: `EDITOR` y `SUPERADMINISTRADOR` ven principal y
  todos los cambios en las consultas editoriales. El contenido accesible por
  suscripción muestra la principal y únicamente cambios `RESUELTA` o `MANUAL`
  con `urlPdf`; no expone estado de resolución, origen de ingesta ni datos
  editoriales internos. El rol global no sustituye la suscripción.
- **Migración histórica sin pérdida de fuentes (estabilización de Fase 5A)**:
  el backfill que traslada la triple y la fuente de `Norma` a
  `EdicionRegistroOficial` (`20260712000000_migrar_fuentes_a_ediciones`) nunca
  descarta URLs históricas. Si una misma triple normalizada
  (`tipo`/`numero`/`fecha` calendario) reúne más de una URL distinta —tomada de
  `normas.fuente` o de `entradas_detectadas_registro_oficial.url_fuente`— la
  migración aborta con `RAISE EXCEPTION`, la transacción revierte y las columnas
  legacy con todas sus URLs se conservan. La migración jamás elige una URL
  arbitrariamente ni concatena candidatas; el conflicto debe resolverse de forma
  explícita en los datos legacy (dejando una única URL) antes de reintentar. El
  camino exitoso solo contempla dos estados: sin fuente → `PENDIENTE`
  (`urlPdf = null`) y fuente única → `RESUELTA`. `CONFLICTIVA` sigue siendo un
  estado válido en runtime para la resolución automática futura cuando un
  catálogo externo devuelve varias candidatas, pero no se usa como mecanismo
  para perder fuentes históricas durante la migración. El `DROP` de las columnas
  legacy ocurre únicamente tras superar todas las comprobaciones.

## Fuera de alcance de esta fase

Scraping real, parser de PDF, descarga del índice, scraper WordPress/AJAX,
integración con el catálogo oficial externo y resolución automática real de
`fuente`, BullMQ/Redis, LLM, OCR, frontend, descarte, fusión, resolución de
duplicados, publicación automática, roles dinámicos y gestión comercial. El
catálogo interno de `EdicionRegistroOficial` sí existe; mientras no haya un
adaptador oficial configurado, `POST /ediciones-registro-oficial/resolver-pendientes`
responde `503 CATALOGO_NO_DISPONIBLE` y conserva las ediciones `PENDIENTE`, sin
fabricar URLs ni interpretarlas como no encontradas.

También quedan diferidos los endpoints para agregar o retirar ediciones de
cambio, la relación jurídica Norma–Norma, artículos afectados, tipos de
reforma y los filtros/paginación del catálogo por tipo, número, fecha y estado
de resolución.

## Consecuencias

- El flujo editorial gana su entrada masiva: bootstrap → login → ingesta
  (superadmin) → revisión de borradores en `/normas` → corrección →
  publicación manual (individual o múltiple).
- El extractor externo puede reintentar el único lote mensual sin duplicar
  contenido y conserva las señales necesarias (`advertencias` y `confianza`)
  en la entrada técnica, nunca en el contrato editorial.
- El costo de la ingesta es proporcional al lote y no incluye una consulta de
  posibles duplicados por cada entrada detectada.
- `Norma` modela ahora el borrador incompleto como estado legítimo: los
  obligatorios se exigen al publicar, no al construir. `Norma` sigue sin
  conocer la ingesta: el origen (`origenRegistroOficial`) se arma en
  aplicación a través de un puerto de solo lectura implementado por el
  repositorio de ingesta. El puerto ofrece consulta individual para el
  detalle y consulta masiva para el listado, evitando N+1.

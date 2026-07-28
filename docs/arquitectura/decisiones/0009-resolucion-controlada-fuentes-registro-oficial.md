# ADR 0009: Resolución controlada de fuentes del Registro Oficial

## Estado

Aceptada

## Contexto

La Fase 5A dejó la ingesta creando ediciones `PENDIENTE` con `urlPdf = null` y
un endpoint `POST /ediciones-registro-oficial/resolver-pendientes` que respondía
siempre `503 CATALOGO_NO_DISPONIBLE`: existían el caso de uso
`ResolverFuenteRegistroOficial` y el puerto `CatalogoRegistroOficial`, pero no
un adaptador oficial (ADR 0008). La fuente solo podía corregirse manualmente y
una norma solo se publica cuando su edición principal es publicable.

La Fase 5B implementa la resolución real y controlada de `urlPdf` contra el
catálogo oficial del Registro Oficial. **No** implementa extracción del
contenido del PDF ni amplía el scraping mensual.

El mecanismo oficial verificado no ofrece una búsqueda directa "por número":
el catálogo es una instalación WordPress cuyo endpoint `admin-ajax`
(`get_term_post_kilur_con_imagen`) lista una carpeta-mes completa (carpeta por
tipo de publicación + términos de año y mes) y devuelve *cards* HTML con título,
número, fecha y URL del PDF. Para resolver una edición hay que ubicar su
carpeta-mes y filtrar por número.

## Decisión

- **El puerto lleva la fecha y devuelve un resultado discriminado.** La consulta
  `CatalogoRegistroOficial.buscarEdiciones` pasa a recibir
  (`tipoPublicacionRegistroOficial`, `numeroPublicacionRegistroOficial`,
  `fechaPublicacionOficial`): la fecha es imprescindible para ubicar la
  carpeta-mes, además de servir como criterio de confianza al desempatar. El
  resultado es un tipo discriminado puro de aplicación:
  `{ exitoso: true; candidatas }` o `{ exitoso: false; razon }`, donde `razon`
  es la unión `'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' |
  'RESPUESTA_CATALOGO_INVALIDA' | 'COBERTURA_CATALOGO_NO_DISPONIBLE' |
  'BUSQUEDA_CATALOGO_INCOMPLETA'`. Así la aplicación nunca confunde un fallo
  del catálogo con "sin resultados": ninguna excepción de infraestructura
  (HTTP, red, parsing) cruza al dominio/aplicación. La fecha oficial detectada
  durante la ingesta jamás se reescribe. La taxonomía de razones se **conserva
  íntegra** desde el puerto hasta el resultado del caso de uso y el contrato
  HTTP agregado: no existe un colapso genérico tipo "error transitorio",
  porque los fallos estructurales (`RESPUESTA_CATALOGO_INVALIDA`), de
  cobertura (`COBERTURA_CATALOGO_NO_DISPONIBLE`) y de búsqueda incompleta
  (`BUSQUEDA_CATALOGO_INCOMPLETA`) no son transitorios. Todos fallan cerrado:
  la edición queda intacta (`PENDIENTE`).

- **Semántica fail-closed (por edición, idempotente).** Solo se procesan
  ediciones `PENDIENTE` con `urlPdf = null`. Coincidencia única y compatible →
  `RESUELTA`; consulta exitosa sin coincidencias → `NO_ENCONTRADA`; varias
  candidatas válidas o fecha discrepante → `CONFLICTIVA` (nunca se elige una URL
  arbitrariamente). Un fallo del catálogo no cambia el estado persistido y se
  reporta con su razón exacta del puerto, nunca como `NO_ENCONTRADA`.
  `NO_ENCONTRADA` afirma ausencia real y solo se persiste con una consulta
  plenamente confiable: taxonomía cubierta, respuesta con estructura reconocible
  de *cards* (no basta con que el texto contenga `<`) o marcador oficial de
  carpeta vacía, paginación recorrida por completo, y ninguna coincidencia
  descartada por URL ausente/vacía/inválida/no-HTTPS/fuera de allowlist ni por
  fecha imposible. El parser no descarta *cards* en silencio: una *card*
  reconocida sin datos indispensables (sin enlace PDF, sin número o tipo
  interpretable) se conserva como evidencia y, si coincide con la consulta o la
  coincidencia no puede descartarse, la respuesta se trata como inválida; solo
  se ignora cuando es demostrable que pertenece a otra edición.
  Cualquier incertidumbre —taxonomía no cubierta (incluidos años posteriores a
  2026), HTML de mantenimiento o inesperado, paginación truncada por el tope de
  páginas, URL coincidente inválida o ausente, *card* ambigua, fecha imposible
  en una *card* coincidente— conserva la edición `PENDIENTE`.
  `MANUAL` y `RESUELTA` no se sobrescriben; `NO_ENCONTRADA` y `CONFLICTIVA`
  son terminales para la resolución automática — no se reprocesan ni generan
  consultas al catálogo; reprocesarlas requerirá una futura operación explícita
  de reapertura/reencolado, no diseñada aquí. La persistencia mantiene el
  compare-and-set de Fase 5A (`guardarResolucionSiPendiente`): una resolución
  solo se guarda si la edición sigue `PENDIENTE` sin URL; una corrección manual o
  resolución concurrente gana la carrera y la obsoleta se omite.

- **Adaptador de infraestructura `CatalogoRegistroOficialHttp`.** Implementa el
  puerto puro consultando el endpoint `admin-ajax` de la carpeta-mes con `fetch`
  nativo (Node), recorriendo la paginación acotada, parseando las *cards* con
  cheerio (única dependencia nueva, aislada en infraestructura) y filtrando por
  abreviatura de tipo + número. La taxonomía (carpeta por tipo, términos de
  año/mes) son los IDs reales del sitio, verificados, no fabricados (cobertura
  2001–2026). El dominio y la aplicación no conocen HTTP, HTML, selectores ni
  detalles del sitio. El adaptador no persiste, no conoce Prisma, no autoriza
  usuarios ni modifica normas.

- **Procesamiento acotado.** Con hasta 1500 pendientes mensuales y un servicio
  externo, una sola petición HTTP no puede procesarlas todas. El puerto de
  ediciones incorpora `listarPendientesSinFuente(limite)` (orden determinista:
  fecha oficial ascendente, luego id) para no cargar todas las pendientes. El
  caso de uso admite resolver `edicionIds` concretos o un lote acotado por un
  máximo seguro configurable, con paralelismo interno limitado que preserva el
  orden. No se añaden Redis, colas, workers ni scheduler.

- **Sin amplificar solicitudes (caché/deduplicación por carpeta-mes).** Sin
  control, procesar 50 ediciones podría implicar hasta 20 páginas cada una
  (≈1000 solicitudes) aunque pertenezcan a la misma carpeta-año-mes. El
  adaptador `CatalogoRegistroOficialHttp` deduplica y cachea localmente la
  descarga por clave carpeta-año-mes: las solicitudes concurrentes de la misma
  carpeta-mes comparten una sola descarga (misma `Promise`) y las cards se
  reutilizan para filtrar distintos números sin repetir la paginación. La caché
  es local al adaptador, acotada en número de entradas y con TTL corto, sin
  Redis, sin persistencia, sin cachear fallos (un transitorio puede reintentarse
  de inmediato) y sin crecimiento ilimitado. No contamina el caso de uso: el
  puerto de aplicación permanece puro, sin taxonomías ni caché.

- **Presupuesto total, reintentos y trato respetuoso.** `timeoutMs` limita la
  búsqueda completa de una carpeta-mes: conexión, espera de headers, lectura
  completa de cada body, paginación, reintentos y esperas de backoff comparten
  el plazo (un body que queda detenido se aborta al vencer, sin dejar streams
  ni promesas pendientes). Al vencer, se devuelve fallo transitorio sin tocar
  la edición. Los reintentos son mínimos y acotados (máximo 3 intentos por
  página, solo ante red/timeout con presupuesto restante y HTTP
  408/425/429/500/502/503/504) y no reintentan 4xx no transitorios. Un
  `Retry-After` válido (segundos o fecha HTTP) se respeta completo — el tope
  del backoff local no lo recorta —; si no cabe en el presupuesto restante no
  se espera parcialmente ni se reintenta, y uno ya vencido equivale a reintento
  inmediato. El backoff local exponencial acotado aplica solo sin `Retry-After`
  válido. La espera es inyectable para no ralentizar los tests. No hay circuit
  breaker complejo.

- **Límites máximos de configuración.** Además de exigir enteros positivos, la
  configuración impone máximos seguros: `TIMEOUT_MS` ∈ [1000, 30000] (default
  15000), `MAX_CONCURRENCIA` ∈ [1, 4] (default 4), `MAX_EDICIONES_POR_EJECUCION`
  ∈ [1, 50] (default 50). Un valor fuera de rango con la integración habilitada
  produce arranque fail-fast, sin secretos en el mensaje.

- **Validación calendárica estricta.** El parseo de fechas de *card* usa
  *round-trip* (`Date.UTC` seguido de verificación de año/mes/día) para rechazar
  fechas imposibles (31 de febrero, 29 de febrero no bisiesto), que de otro modo
  se normalizarían a un día real incorrecto. Una fecha inválida en una card
  coincidente impide una resolución automática confiable.

- **Configuración y arranque.** La integración está deshabilitada por defecto: sin
  `CATALOGO_REGISTRO_OFICIAL_HABILITADO=true` y
  `CATALOGO_REGISTRO_OFICIAL_BASE_URL`, el módulo no inyecta el adaptador y el
  endpoint responde `503 CATALOGO_NO_DISPONIBLE` sin tocar ediciones. Con la
  integración deshabilitada, las demás variables `CATALOGO_REGISTRO_OFICIAL_*`
  se ignoran por completo: una variable opcional residual inválida no impide el
  arranque y la configuración devuelve defaults seguros y deterministas (solo
  un valor no booleano de `..._HABILITADO` sigue fallando). Habilitada
  pero mal configurada, el arranque es fail-fast con mensaje claro y sin
  secretos. Variables:
  `CATALOGO_REGISTRO_OFICIAL_HABILITADO`, `_BASE_URL`, `_DOMINIOS_PDF`
  (allowlist; por defecto el host real verificado de los PDFs,
  `esacc.corteconstitucional.gob.ec` — ver "Verificación contra el sitio
  real"), `_TIMEOUT_MS`, `_MAX_CONCURRENCIA`, `_MAX_EDICIONES_POR_EJECUCION`,
  `_ANIOS_EXTRA` (parche operativo de la taxonomía de años, formato
  `"anio:idDelSitio"` separado por comas; nunca sobrescribe un año ya
  verificado en el código — ver "Cobertura de la taxonomía de años").

- **Seguridad (SSRF).** La URL base proviene solo de configuración, nunca del
  request. Solo HTTPS (http exclusivamente en localhost, para pruebas). Timeout
  explícito, tamaño de respuesta acotado, validación del formato antes de
  parsear, redirects no seguidos a ciegas (un 3xx se trata como respuesta
  inválida), allowlist de dominio para las URLs PDF (que además deben ser HTTPS)
  y deduplicación de URLs idénticas. No se registran cuerpos completos ni
  secretos y ante cualquier fallo no se fabrica ninguna URL.

- **HTTP.** Se mantiene `POST /ediciones-registro-oficial/resolver-pendientes`
  (200) con cuerpo opcional y estrictamente validado (`edicionIds` o `limite`,
  mutuamente excluyentes — enviar ambos → 400 `SOLICITUD_INVALIDA` —,
  propiedades adicionales → 400). La respuesta resume
  `procesadas/resueltas/noEncontradas/conflictivas/omitidas/erroresCatalogo/erroresPorRazon`,
  sin ocultar fallos del catálogo como `NO_ENCONTRADA` ni colapsarlos en un
  contador genérico: `erroresPorRazon` incluye siempre las cuatro razones del
  puerto (aunque valgan cero) y `erroresCatalogo` es exactamente su suma. No
  existe `erroresTransitorios`. No se exponen URLs consultadas, HTML ni
  excepciones internas. Acceso: SUPERADMINISTRADOR
  permitido; EDITOR/ADMINISTRADOR/SUSCRIPTOR 403; sin token 401.

- **Sin cambios de esquema.** Los estados de resolución y `urlPdf` ya existían;
  no se modifican migraciones ni el schema Prisma.

## Verificación contra el sitio real (julio 2026)

La taxonomía y el dominio de los PDFs se contrastaron con el sitio oficial en
julio de 2026 (páginas públicas de catálogo + cards reales), corrigiendo una
suposición errada de la primera versión de esta ADR:

- **Páginas públicas de catálogo por tipo** (cada una con el árbol lateral
  2001–2026 que expone `data-id-carpeta`/`data-year-id`/`data-mes-id`):
  Registro Oficial `/245427-2/` (carpeta 1954), Suplementos `/255776-2/`
  (1991), Edición Especial `/261974-2/` (1992), Índice/resúmenes `/265554-2/`
  (1993, no usado por esta resolución), Edición Jurídica `/266381-2/` (1994)
  y Ediciones Constitucionales `/267099-2/` (1995). Los IDs de carpeta, año
  (2001→1956 … 2026→2002) y mes (enero→1979 … diciembre→1990) coinciden al
  100% con `registro-oficial-taxonomias.ts`.
- **Dominio real de los PDFs.** Los enlaces "Descargar" de las cards apuntan
  — en todos los tipos y todos los años — al almacenamiento de la Corte
  Constitucional (`esacc.corteconstitucional.gob.ec`), nunca al propio
  `registroficial.gob.ec`. El default original de la allowlist (host de la
  base) habría rechazado todas las URLs reales dejando la resolución
  inoperante (fail-closed: ediciones `PENDIENTE`, sin corrupción). El default
  corregido es el host verificado; `_DOMINIOS_PDF` lo reemplaza si el sitio
  cambia de almacenamiento. El fixture local y los E2E usan ese mismo host
  para ejercitar el contrato real, no uno de fantasía.
- **Riesgo documentado, no resuelto:** las URLs de PDF incluyen un token
  codificado del API de almacenamiento; no está verificado si caducan con el
  tiempo. Si caducaran, las fuentes `RESUELTA` podrían romperse y habría que
  re-resolver o corregir manualmente; se aceptó como riesgo operativo
  observable antes de diseñar una mitigación.

## Cobertura de la taxonomía de años

`YEAR_ID_POR_ANIO` cubre 2001–2026: son IDs verificados del sitio, no una
fórmula (el WordPress del Registro Oficial se los asigna por orden de
creación de cada carpeta-año). Un año fuera de rango no es un error: es
incertidumbre real, y `ubicarCarpetaRegistroOficial` devuelve `null` ->
`COBERTURA_CATALOGO_NO_DISPONIBLE`, dejando la edición `PENDIENTE` (fail-
closed, igual que cualquier otra incertidumbre de esta ADR).

Dos mecanismos evitan que ese límite se convierta en un vacío operativo
silencioso:

- **Extensión por configuración (`CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA`,
  formato `"anio:idDelSitio"` separado por comas).** Cuando el sitio crea la
  carpeta de un año nuevo, su ID solo se conoce viendo el sitio real en ese
  momento; exigir un redespliegue de código para poder resolverlo sería
  operativamente lento. La variable permite declarar ese ID como parche de
  urgencia sin tocar código. La taxonomía verificada en código **siempre
  gana** sobre `aniosExtra` para el mismo año: una variable mal puesta jamás
  sobrescribe un dato ya verificado, solo puede llenar un vacío. Es un parche
  temporal, no un reemplazo de consolidar el año en `YEAR_ID_POR_ANIO` con
  calma.
- **Alarma dura en CI (`registro-oficial-taxonomias.test.ts`), independiente
  de `_ANIOS_EXTRA`.** Desde noviembre de cada año, un test falla si
  `YEAR_ID_POR_ANIO` no cubre también el año siguiente. La prueba inspecciona
  exclusivamente `YEAR_ID_POR_ANIO`: `_ANIOS_EXTRA` puede mantener el
  servicio operativo ante una urgencia, pero **no satisface, silencia ni
  reemplaza** esta alarma, porque la variable de entorno nunca modifica
  `YEAR_ID_POR_ANIO`. La alarma se considera resuelta únicamente cuando el
  año y su ID oficial verificado se incorporan a `YEAR_ID_POR_ANIO`; si
  `_ANIOS_EXTRA` se activó para cubrir la urgencia, la deuda de consolidación
  sigue abierta hasta ese momento. Esta exigencia mantiene la taxonomía
  auditable, versionada y reproducible: el parche de entorno resuelve la
  continuidad operativa inmediata, pero nunca se acepta como cierre
  permanente de esa deuda. Antes de noviembre solo se exige cubrir el año en
  curso: el sitio oficial recién crea la carpeta del año siguiente cerca de
  su propio inicio, así que una alarma activa todo el año generaría ruido
  sin dar tiempo útil de reacción.

## Consecuencias

- La publicación sigue dependiendo exclusivamente de la edición principal
  publicable; las normas proyectan la fuente de la edición compartida sin
  persistir una copia. Las ediciones de cambio no bloquean la publicación.
- El costo de resolución es proporcional al lote acotado y al catálogo externo,
  no a la totalidad de pendientes; el circuito puede reintentarse de forma segura
  por idempotencia y compare-and-set.
- La resolución no depende del sitio oficial en CI: el adaptador se prueba contra
  un servidor HTTP local controlado con fixtures (unitario, E2E memoria y E2E
  Prisma con el catálogo habilitado por configuración de test y construido por
  `NormasPrismaModule`). La colección Newman corre con el catálogo habilitado
  contra el fixture local
  `packages/infraestructura/scripts/fixture-catalogo-registro-oficial.js`
  (emula el contrato `admin-ajax` mínimo: carpeta-mes con cards válidas y un
  mes en mantenimiento) y comprueba automáticamente el contrato 200 —
  `erroresCatalogo`/`erroresPorRazon`, ausencia de `erroresTransitorios`, un
  fallo del catálogo que no incrementa `noEncontradas` y la edición afectada
  aún `PENDIENTE` — además de permisos y validación; con
  `catalogoHabilitadoLocal=false` la colección vuelve a ejercitar el 503. La
  petición de "prueba real" contra el sitio oficial sigue siendo manual y no se
  envía salvo `ejecutarPruebaRealCatalogo=true`.

## Fuera de alcance

Extracción del contenido completo del PDF, OCR, LLM, scraping del resumen
mensual, descarga masiva, Redis/BullMQ, workers, scheduler, publicación
automática, relaciones jurídicas Norma–Norma, artículos afectados, tipos de
reforma y los filtros/paginación generales del catálogo (más allá del límite
mínimo necesario para que la resolución externa sea segura).

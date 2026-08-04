# ADR 0011: Análisis y confirmación de índices mensuales por URL (API-first)

## Estado

Aceptada

## Contexto

ADR 0010 (Fase 5C) implementó un extractor determinista del índice mensual
del Registro Oficial, pero como CLI standalone que trabaja únicamente con un
PDF **local ya descargado**: la descarga por URL y el envío automático del
payload al backend quedaron explícitamente fuera de alcance.

Todavía no existe un repositorio frontend Next.js. La Fase 5D necesita una
operación mensual real, iniciada manualmente por un `SUPERADMINISTRADOR`, que
se pueda operar desde el primer día con Postman o `curl`, sin esperar a ese
frontend, y sin comprometer el contrato que ese frontend futuro consumirá.

Una auditoría técnica de solo lectura previa a este bloque confirmó que el
diseño encaja con la arquitectura hexagonal existente sin tocar dominio,
Prisma, schema ni migraciones, y encontró un hallazgo real de diseño:
`versionExtractor` participa en `huellaLote` (`CalculadoraHuellaLote`), por
lo que ese valor debe ser una constante estable del código, nunca un
timestamp, build, commit ni un valor libre del cliente.

## Decisión

- **Dos acciones separadas, nunca una sola operación combinada**: `Analizar`
  (`POST /ingesta/registro-oficial/indices/analizar`) previsualiza sin
  escribir nada; `Confirmar` (`POST /ingesta/registro-oficial/indices/confirmar`)
  ingiere de verdad. El operador decide entre ambas llamadas si el resultado
  es aceptable. Una solicitud procesa exactamente un período `AAAA-MM`: sin
  `desde`/`hasta`, sin procesamiento de otro mes en la misma ejecución.
- **Doble descarga, deliberada**: `Confirmar` nunca reutiliza los bytes ni el
  resultado de un `Analizar` previo — vuelve a descargar el PDF y a
  extraerlo desde cero. Se acepta este costo para evitar persistencia
  temporal, migraciones nuevas, estado en memoria dependiente de una
  instancia del proceso o tokens de continuación enormes.
- **Dos puertos técnicos nuevos y pequeños, no uno combinado**:
  `DescargadorPdfIndiceRegistroOficial` (descarga acotada, deriva bytes +
  tamaño + SHA-256) y `ExtractorIndiceMensualRegistroOficial` (envuelve
  `leerPdf`/`parsearDocumento`/`construirPayloadIngesta` de Fase 5C sin
  modificarlos, expone `versionExtractor` como fuente única de verdad).
  Separar descarga de extracción replica el precedente ya establecido por
  el propio repositorio (ADR 0010: "cuatro componentes con separación
  mínima, sin sobre-ingeniería"; el puerto `CatalogoRegistroOficial` ya
  vive separado de los puertos de persistencia) y permite aislar cada
  preocupación técnica en pruebas TDD independientes (rojo de validación de
  URL, luego rojo de streaming/timeout, luego rojo de errores de PDF, cada
  uno sin depender de los demás).
- **`Analizar` sin ningún puerto de persistencia con capacidad de
  escritura**: la ausencia de escritura es una garantía estructural del
  constructor (`DependenciasAnalizarIndiceMensualRegistroOficial` no
  declara `RepositorioIngestaRegistroOficial`, `RepositorioNormas` ni
  `RepositorioEdicionesRegistroOficial`), no solo de comportamiento —
  verificada además con conteos de filas antes/después en los e2e memoria y
  Prisma. Sí depende de `RepositorioUsuarios`, un puerto persistente pero
  exclusivamente de lectura, usado solo para autenticar y autorizar al
  actor: no es una excepción a la garantía anterior, que se refiere
  específicamente a la capacidad de escritura sobre lotes, entradas,
  normas o ediciones.
- **`Confirmar` compone `IngerirResumenRegistroOficial` como caja negra, por
  inyección**: construye exactamente el mismo
  `SolicitudIngerirResumenRegistroOficial` que ya recibe
  `POST /ingesta/registro-oficial/resumenes` (con `urlPdf` como
  `urlResumenMensualRegistroOficial` y la versión actual del extractor) y
  delega su `.ejecutar(...)` sin reimplementar huella, idempotencia,
  transacción ni la protección ante carreras del mismo período — todas ya
  provistas y probadas por Fase 5A. `IngerirResumenRegistroOficial.ts`,
  `PoliticaIngestaRegistroOficial.ts` y el extractor de Fase 5C
  (`cli.ts`, `adaptador-pdfjs.ts`, `parser-indice-mensual.ts`,
  `constructor-payload-ingesta.ts`) quedan sin una sola línea modificada.
- **`urlPdf` participa en la huella del lote**: como
  `urlResumenMensualRegistroOficial` ya formaba parte de
  `ContenidoLoteParaHuella` desde Fase 5A, el mismo período mensual con la
  misma versión y las mismas entradas pero una URL de PDF distinta produce
  `EJECUCION_INGESTA_CONFLICTIVA` (409), aunque el contenido extraído
  coincida — comportamiento heredado sin cambios, cubierto explícitamente
  por regresión en este bloque.
- **Handshake de versión antes de handshake de hash, ambos antes de
  gastar red/CPU en lo siguiente**: `Confirmar` compara
  `versionExtractorObservada` contra `ExtractorIndiceMensualRegistroOficial.versionExtractor`
  **antes** de descargar (protege una confirmación ejecutada después de un
  despliegue que cambió el extractor: `VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS`,
  409) y compara el SHA-256 recalculado contra `sha256PdfObservado`
  **antes** de extraer (`PDF_INDICE_CAMBIO_DESDE_ANALISIS`, 409). La
  versión estable inicial es la constante de código `indice-mensual-v1`
  (`ExtractorIndiceMensualRegistroOficialPdfjs.versionExtractor`, única
  fuente de verdad): nunca un timestamp, fecha de build, commit Git ni un
  valor libre enviado por el cliente. Cambia únicamente cuando cambia
  deliberadamente la semántica del extractor.
- **Previsualización completa, sin muestreo**: `Analizar` devuelve
  `entradasDetectadas` completas (no una muestra de 20/50): un mes con un
  formato histórico incompatible puede producir pocas entradas o muchas
  advertencias, y una muestra parcial podría ocultar ese defecto en vez de
  exponerlo para que el operador decida no confirmar. `analisis` añade
  `totalEntradas`, `totalConAdvertencias` y `advertenciasPorTipo` (conteo
  determinista por código de advertencia) como resumen barato de calidad.
- **Sin umbral automático de "calidad suficiente"**: ni `Analizar` ni
  `Confirmar` rechazan un PDF por tener pocas entradas o muchas
  advertencias. El extractor certificado en 2026 no se presenta como
  compatible automáticamente con todo el histórico; un formato incompatible
  se estabiliza con un ciclo TDD dedicado sobre evidencia real de ese PDF,
  nunca ajustando expectativas para tolerar una extracción defectuosa (mismo
  principio ya establecido en ADR 0010).
- **Seguridad de la URL, fail-closed y sin excepción de host local**: a
  diferencia de `esOrigenSeguro` (Fase 5B, que acepta `http:` en
  `localhost` para su propio servidor de pruebas), la validación de esta
  URL (`esUrlIndicePermitida`) no tiene ninguna excepción: `https:`
  obligatorio, hostname exacto `esacc.corteconstitucional.gob.ec`
  (igualdad estricta, nunca substring/`includes`/`endsWith`), sin
  usuario/contraseña embebidos, sin puerto explícito (`:443` se acepta
  porque WHATWG lo normaliza al puerto HTTPS por defecto). Los tests
  inyectan dobles de los dos puertos técnicos en vez de depender de una
  excepción de red real — nunca se relaja la política productiva para
  facilitar pruebas.
- **No se reutiliza `CatalogoRegistroOficialHttp`**: ese adaptador decodifica
  su cuerpo como texto UTF-8 (consume HTML del admin-ajax de Fase 5B) y su
  `esOrigenSeguro` tiene la excepción de host local mencionada arriba —
  ninguna de las dos cosas es apropiada para bytes binarios de un PDF ni
  para una URL que introduce un `SUPERADMINISTRADOR` real. El patrón de
  streaming acotado (`AbortController` + timeout total, carrera lectura-vs-
  abort, cancelación real del lector, pre-chequeo de `Content-Length` +
  conteo real de bytes) se reutiliza como diseño en un adaptador nuevo e
  independiente (`DescargadorPdfIndiceRegistroOficialHttp`), sin tocar el
  archivo de Fase 5B.
- **Mismo límite de tamaño que Fase 5C, nunca un segundo número**: el
  descargador reutiliza la constante exportada `LIMITE_TAMANIO_BYTES` de
  `adaptador-pdfjs.ts` (50 MB) tanto para el pre-chequeo de
  `Content-Length` como para el conteo real de bytes durante el streaming
  (nunca confía únicamente en el header, que puede faltar o mentir).
- **Content-Type laxo, con rechazo temprano solo de lo explícitamente
  incompatible**: la URL es tokenizada y no necesariamente termina en
  `.pdf` (no se valida por extensión); tampoco se exige un `Content-Type`
  concreto — se acepta ausente o `application/octet-stream`.
  `Content-Type` permite un rechazo temprano cuando declara texto
  explícitamente incompatible (`text/html`, `text/plain`, cualquier
  `text/*`), antes de leer el cuerpo. Para las respuestas admitidas por ese
  filtro, la cabecera `%PDF-` y PDF.js (ya implementados en `leerPdf`, sin
  cambios) realizan la validación definitiva de si el contenido es un PDF
  válido.
- **Riesgo residual de DNS rebinding, aceptado explícitamente**: una
  allowlist de hostname exacto no impide que el hostname resuelva a una IP
  distinta entre la verificación y la conexión real (`fetch` nativo de Node
  no expone pinning de IP). Se acepta como riesgo residual dado que el
  actor es siempre un `SUPERADMINISTRADOR` autenticado (nunca anónimo)
  contra un único hostname fijo controlado por la misma organización que
  opera el Registro Oficial — no se implementa pinning de IP, dispatcher
  DNS personalizado ni dependencias nuevas para mitigarlo.
- **Timeout de descarga configurable, sin timeout artificial de
  extracción**: `INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS` (rango
  1000–60000 ms, default 30000) cubre exclusivamente conexión, cabeceras y
  lectura completa del cuerpo. El valor predeterminado de Fase 5D, 30
  segundos, coincide con el máximo permitido por Fase 5B
  (`CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS` ∈ [1000, 30000]). Fase 5D
  permite, mediante configuración explícita, ampliar exclusivamente la
  descarga hasta 60 segundos — el rango máximo en sí es mayor que el de
  Fase 5B, no el mismo. La extracción (PDF.js + parser) no tiene timeout
  propio: es
  determinista y ya está acotada por el límite de 50 MB; medida
  directamente contra el fixture real de mayo de 2026 (1 071 024 bytes, 53
  páginas, 869 entradas) dio ~326–592 ms por ejecución (primera ejecución
  más lenta por carga de módulos; ejecuciones repetidas, estables en
  ~326 ms). El tiempo de descarga real contra el sitio oficial no pudo
  medirse en este bloque (las pruebas automatizadas no dependen de Internet
  ni del sitio oficial, por diseño); el presupuesto de 30 s deja margen
  amplio frente a la extracción medida.
- **Endpoints síncronos, sin colas ni jobs**: dado que la extracción
  medida es sub-segundo y la descarga tiene un timeout acotado y
  configurable, un endpoint HTTP síncrono es viable para esta operación
  manual y mensual, sin introducir Redis, BullMQ, workers ni scheduler.
- **Contrato HTTP nuevo, el existente intacto**: `POST /ingesta/registro-oficial/resumenes`
  no cambia. Errores nuevos, aditivos en `razonAExcepcionHttp`
  (`mapeo-http.ts`): `URL_PDF_INDICE_NO_PERMITIDA` (400),
  `PERIODO_INDICE_NO_DETECTADO`/`PERIODO_INDICE_NO_COINCIDE`/`PDF_INDICE_INVALIDO`/
  `PDF_INDICE_CIFRADO`/`PDF_INDICE_SIN_CAPA_DE_TEXTO` (422, problema
  semántico del archivo/contenido, no de la solicitud HTTP en sí),
  `PDF_INDICE_DEMASIADO_GRANDE` (413),
  `PDF_INDICE_CAMBIO_DESDE_ANALISIS`/`VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS`
  (409, misma familia que el resto de conflictos de estado),
  `DESCARGA_INDICE_INVALIDA` (502, la respuesta remota es inválida/redirect/4xx),
  `DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE` (503, red/timeout/5xx
  remoto). No se expone URL completa con token, cuerpo remoto ni
  detalles internos de PDF.js.
- **Pruebas sin PDF.js real dentro de Jest, salvo un subproceso dedicado**:
  `leerPdf` requiere un `import()` dinámico genuino que el sandbox VM de
  Jest no soporta sin `--experimental-vm-modules` global (mismo motivo ya
  documentado en ADR 0010 para `cli.test.ts`). `ExtractorIndiceMensualRegistroOficialPdfjs`
  recibe `leerPdf`/`parsearDocumento`/`construirPayloadIngesta` como
  dependencias inyectables (mismo patrón que `fetchImpl` en
  `CatalogoRegistroOficialHttp`) para poder probar su propia lógica de
  mapeo de excepciones sin PDF.js real; el ejercicio genuino contra el
  fixture real de mayo de 2026 vive en un test dedicado que ejecuta el
  adaptador ya compilado como proceso hijo de un solo uso (mismo patrón que
  `cli.test.ts`). Los e2e HTTP (memoria y Prisma) reemplazan los dos
  puertos técnicos por dobles deterministas — nunca dependen del sitio
  oficial ni de Internet — y verifican el contrato completo (autorización
  antes de red, validación, versión/hash/período, idempotencia,
  concurrencia, cero escrituras en `Analizar`) con datos controlados.

## Fuera de alcance de este bloque

Frontend Next.js (todavía no existe como repositorio), scraping automático
del catálogo, scheduler/cron, Redis, colas/workers, procesamiento de varios
meses en una misma ejecución, publicación automática de normas, resolución
automática de fuentes dentro de `Confirmar` (el `loteId` devuelto se usa
después, manualmente, con el endpoint ya existente de Fase 5B), soporte
garantizado para todo el histórico anterior a 2026, y pinning de IP/DNS
personalizado para mitigar el riesgo residual de rebinding documentado
arriba.

## Consecuencias

- El backend puede, por primera vez, descargar y procesar un índice mensual
  a partir de una URL suministrada por un operador humano, sin depender de
  un extractor externo ejecutado a mano ni de un envío manual del payload
  generado.
- El costo de mantenimiento del extractor sigue siendo independiente de
  este bloque: Fase 5C no se modifica: `Analizar`/`Confirmar` son
  exclusivamente la superficie de descarga + orquestación + delegación en
  la ingesta ya existente.
- Un cambio real de formato histórico requiere su propio ciclo TDD sobre
  evidencia real del PDF nuevo, igual que ya establece ADR 0010 para el
  extractor mismo — este bloque no promete compatibilidad automática hacia
  atrás.
- El riesgo residual de DNS rebinding queda documentado y aceptado, no
  resuelto: una futura fase podría revisarlo si cambia el nivel de
  confianza del actor autorizado a invocar estos endpoints.

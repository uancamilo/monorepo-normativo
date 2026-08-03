# ADR 0010: Extractor real del índice mensual del Registro Oficial

## Estado

Aceptada

## Contexto

ADR 0008 dejó explícitamente fuera de alcance de la Fase 5A el "parser de PDF"
y la "descarga del índice": el backend recibía el lote mensual ya detectado
por un extractor externo, pero ese extractor no existía todavía. La Fase 5C
implementa ese primer bloque: un extractor determinista del índice mensual de
legislación del Registro Oficial que lee un PDF y produce el JSON compatible
con el contrato de `POST /ingesta/registro-oficial/resumenes` (`EntradaDetectadaHttpDto` /
`IngerirResumenHttpDto`, `packages/infraestructura/src/ingesta/dto/ingerir-resumen-http.dto.ts`).

Este primer bloque trabaja únicamente con un PDF local ya descargado. La
descarga por URL y el envío automático del payload al backend quedan fuera de
alcance.

## Decisión

- **Proceso externo al backend, no un módulo de NestJS**: el extractor vive en
  `packages/infraestructura/src/ingesta/extractor-registro-oficial/` como un
  CLI standalone (`cli.ts`, script npm `extraer:registro-oficial`). No se
  integra al proceso de NestJS, no se registra como módulo, no expone
  endpoint y no se invoca desde ningún caso de uso del backend. Es infraestructura
  en el sentido de "detalle técnico reemplazable", no en el sentido de "vive
  dentro del servidor".
- **Nunca escribe en PostgreSQL ni llama al backend**: el CLI lee el PDF local
  indicado, escribe el JSON del payload en la ruta de salida indicada y
  termina. No abre conexión a base de datos, no hace peticiones HTTP y no
  ejecuta `POST /ingesta/registro-oficial/resumenes` por sí mismo — el envío
  del payload generado sigue siendo una acción manual/separada.
- **Cuatro componentes con separación mínima, sin sobre-ingeniería**:
  - `modelo-lectura-visual.ts`: tipos puros (`PalabraPosicionada`, `PaginaLeida`)
    que cualquier extractor de texto posicional de un PDF puede producir.
  - `adaptador-pdfjs.ts`: el único módulo que conoce PDF.js; convierte bytes
    de un PDF real en `PaginaLeida[]` y clasifica errores (PDF inválido,
    cifrado, sin capa de texto, demasiado grande).
  - `parser-indice-mensual.ts`: parser puro (sin PDF.js, sin NestJS, sin
    Prisma, sin HTTP) que interpreta líneas/columnas/párrafos/referencias de
    publicación y produce `EntradaParseada[]` en orden de lectura visual.
  - `constructor-payload-ingesta.ts` + `cli.ts`: ensamblan el JSON final y
    coordinan lectura de archivo, validación de argumentos y escritura de
    salida.
  - El dominio y la aplicación permanecen libres de PDF.js, NestJS, Prisma y
    detalles de extracción. Infraestructura importa
    `PublicacionRegistroOficialDetectada` solo como tipo y reutiliza
    `TIPOS_PUBLICACION_REGISTRO_OFICIAL` como valor de solo lectura en tiempo
    de ejecución para validar el vocabulario del contrato, sin duplicarlo ni
    modificarlo; la dependencia continúa en la dirección
    infraestructura → aplicación.
- **Frontera local validada antes de PDF.js**: el CLI rechaza opciones
  desconocidas o repetidas, valores obligatorios vacíos, URL inválida y
  períodos fuera de 1900–2100. Comprueba con `stat` el límite de 50 MB antes
  de leer los bytes del archivo; un PDF que excede el límite no llega a
  `readFile` ni a PDF.js. El binario debe compilarse primero con
  `npm run build`; como npm ejecuta el script del workspace desde
  `packages/infraestructura`, se recomiendan rutas absolutas para
  `--pdf` y `--salida`.
- **`pdfjs-dist@5.4.624` (versión exacta) como única dependencia nueva**,
  agregada solo en `@normativo/infraestructura`. `pdfjs-dist` no publica build
  CommonJS desde la v4 (`main` apunta a un `.mjs`, sin `exports` alternativo):
  bajo `module: "commonjs"` de este proyecto, TypeScript reescribe
  `await import(...)` a `require(...)`, lo que rompe la carga. Se resuelve
  forzando un `import()` dinámico real y no reescribible mediante
  `new Function('specifier', 'return import(specifier)')` — una adaptación
  local para conservar el `import()` dinámico genuino bajo compilación
  CommonJS (no una técnica documentada por el proyecto de PDF.js), y sin
  cambiar `tsconfig`, `engines` ni la dependencia elegida. Se usa el build
  `pdfjs-dist/legacy/build/pdf.mjs` porque el propio paquete advierte en
  tiempo de ejecución (mensaje observado directamente al ejecutar el build
  por defecto en Node.js) que se use el build `legacy`; el build por
  defecto asume APIs de navegador como `DOMMatrix`.
- **Lectura visual, no basada en heurísticas de puntuación**: la segmentación
  en párrafos se deriva del interlineado real observado por columna (altura
  de línea reportada por PDF.js más el salto vertical entre líneas,
  agrupados adaptativamente), nunca de una distancia absoluta específica de
  este PDF ni de si una línea empieza con "-". Esto es deliberado: un guion a
  mitad de frase ("2023 - 2027", "EPA EP") no debe partir una entrada, y una
  entrada real puede carecer de viñeta. La detección de columnas usa un
  perfil de densidad horizontal (franjas verticales que la gran mayoría de
  las filas físicas de la página no ocupan), no una coordenada X fija.
- **`fecha` es un ancla de cierre de publicación, no una relación 1:1 con
  Normas**: una entrada puede citar más de una publicación (p. ej. una fe de
  erratas posterior). El extractor nunca crea una segunda entrada ni una
  asociación de `CAMBIO` por esto: selecciona la publicación cronológicamente
  más temprana como `publicacion` principal y conserva el resto en
  `metadataExtraccion.publicacionesAdicionales`, con la advertencia
  `MULTIPLES_PUBLICACIONES_DETECTADAS`. Una fecha con formato aparente pero
  imposible en el calendario (p. ej. 31 de febrero) no se normaliza a otro
  día: se conserva la entrada y su `segmentoCrudo`, la fecha queda `null` y
  se agrega `FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA`.
- **Advertencias reutilizan el vocabulario existente del proyecto** cuando
  aplica (`TIPO_NORMA_NO_DETECTADO`, `TITULO_NO_DETECTADO`,
  `INSTITUCION_NO_DETECTADA`, `TIPO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO`,
  ya usadas por `IngerirResumenRegistroOficial` en aplicación) y agrega solo
  las que no tenían equivalente: `NUMERO_NORMA_NO_DETECTADO` (no fue posible
  aislar un identificador canónico), `ENTRADA_SIN_VINETA` (entrada real sin
  guion inicial), `MULTIPLES_PUBLICACIONES_DETECTADAS` y
  `DIA_SEMANA_INCONSISTENTE` (el día de la semana textual no corresponde al
  calendario de la fecha citada; la fecha nunca se altera por esto, solo se
  señala). `IngerirResumenRegistroOficial` puede volver a derivar
  internamente una advertencia que el extractor ya reportó (p. ej.
  `INSTITUCION_NO_DETECTADA`); la lista final se deduplica en el único punto
  donde se ensambla, preservando el orden de primera aparición, sin quitar
  ninguna señal real ni cambiar el vocabulario.
- **Tipo, número y título: el marcador jurídico más cercano a la cita
  oficial gana, no el primero del párrafo** (`Res.`, `Acdo.`, `Ord.`,
  `Sent.`, `Dctmn.`, `Dcto.`, `Auto.`, `Ley`). Un párrafo puede mencionar
  "Ley" narrativamente mucho antes del marcador formal real (p. ej. "...
  conforme a la Ley de Compañías. Res. BCE-GG-011-2026."); tomar el primer
  marcador del texto confundía esa mención con el tipo real. `Ley` se trata
  como caso especial solo cuando aparece cerca del inicio del texto de la
  entrada (anunciándola, no citándola de paso): en ese caso no hay
  identificador corto que extraer — `numero` queda `null` y `titulo` es el
  nombre completo de la ley, nunca una descripción convertida en número.
- **Identificador canónico en `numero`**: PDF.js puede
  entregar un identificador partido en fragmentos por un salto de línea o
  columna (p. ej. "UAFE-" al final de una línea y "DG-2026-0007" al inicio
  de la siguiente); al unir líneas, ese espacio queda pegado a un `-` o
  `/`. Se normaliza únicamente el espacio que toca un `-` o `/` y se
  eliminan etiquetas editoriales conocidas (`Caso`, `de causa.`) y una
  repetición exacta del mismo identificador. Otros espacios internos se
  conservan porque pueden ser parte del identificador oficial. Si no puede
  aislarse un identificador, `numero` queda `null` con
  `NUMERO_NORMA_NO_DETECTADO`. La normalización aplica solo a `numero`;
  `segmentoCrudo` conserva la representación textual detectada tal cual.
- **Reconstrucción textual solo con evidencia geométrica, nunca con diccionarios**: la separación entre fragmentos de una misma línea, la unión de un guion de fin de línea en un encabezado y el descarte de texto no reconstruible se deciden exclusivamente con la geometría que entrega PDF.js (huecos entre fragmentos, continuidad vertical entre líneas del mismo párrafo) o con propiedades genéricas del texto ya reconstruido — nunca con el nombre de una institución concreta, una frase literal del documento piloto ni la posición de una entrada.
  - El umbral que decide si hay un espacio real entre dos fragmentos de una línea es proporcional a la altura de línea medida por el propio extractor (no un valor absoluto de este documento), calibrado contra la distribución empírica de huecos del fixture piloto: reemplaza un umbral fijo anterior que fusionaba espacios reales por debajo de 1pt, causando instituciones y títulos con palabras pegadas.
  - Un guion de fin de línea dentro de un encabezado institucional/de sección se elimina solo cuando la línea siguiente pertenece al mismo párrafo (evidencia ya validada por la propia segmentación en párrafos); nunca se toca un guion dentro del cuerpo de una entrada, donde sigue rigiendo únicamente la normalización de espacios de `numero`.
  - Un `institucion` que, pese a toda la evidencia geométrica disponible, conserva una transición de minúscula a mayúscula sin espacio (p. ej. "GobiernoAutónomo...") se trata como no reconstruible: queda `null` con `INSTITUCION_NO_DETECTADA` en vez de publicarse pegado. Esto reemplaza un parche anterior que reescribía literalmente la frase "Gobierno Autónomo Descentralizado", retirado por no ser generalizable a otros nombres institucionales con el mismo problema.
  - Para `titulo` esa misma señal produce falsos positivos reales (siglas y unidades mixtas legítimas como "SARS-CoV-2", "PDyOT", "kWh"): se usa en su lugar una racha de letras sin ningún espacio más larga que cualquier palabra plausible en español; de lo contrario queda `null` con `TITULO_NO_DETECTADO`. `segmentoCrudo` nunca recibe ninguna de estas normalizaciones.
- **Posible fusión de dos fichas jurídicas dentro de un mismo párrafo (`POSIBLE_FUSION_ENTRADAS`), fail-closed y sin dividir automáticamente**: la continuidad geométrica de un párrafo (misma fila física, mismo párrafo, sin salto detectable) determina cuántos párrafos hay en la página, **nunca** cuántas fichas jurídicas describe. Se investigó un caso del fixture piloto donde el propio texto del párrafo mezcla dos cláusulas jurídicas con identificadores distintos sin ningún salto geométrico entre ellas; una versión anterior de este ADR concluía incorrectamente que la ausencia de salto de párrafo demostraba que era una sola ficha jurídica válida — esa conclusión queda corregida. Cuando el texto de un párrafo exhibe evidencia genérica y puramente estructural de esa mezcla (una cláusula de apertura que se repite textualmente dentro del párrafo, asociada a dos o más identificadores de causa distintos), el extractor no divide automáticamente el párrafo en dos entradas ni elige arbitrariamente cuál identificador es el correcto: conserva una sola entrada con `numero: null`, `titulo: null`, `tipo` si el marcador jurídico final sigue siendo inequívoco, `confianza: 1` y las advertencias `POSIBLE_FUSION_ENTRADAS`, `NUMERO_NORMA_NO_DETECTADO` y `TITULO_NO_DETECTADO`; `segmentoCrudo` conserva ambos identificadores en conflicto sin reescritura, para que la revisión editorial resuelva después el valor verdadero. La detección no consulta ninguna fuente externa, no usa nombres propios ni identificadores concretos del fixture piloto como regla de producción, y se valida contra las 869 entradas reales sin ningún falso positivo (un caso acumulado legítimo con varios identificadores, o una norma que reforma/deroga otra citando su identificador, no disparan esta advertencia porque ninguno repite una cláusula de apertura completa dentro del mismo párrafo).
- **Sección e institución son estados distintos**: la tipografía sostenida
  en mayúsculas identifica un encabezado, pero no determina por sí sola su
  función. Los encabezados estructurales (`AVISOS JUDICIALES`, `FE DE
  ERRATAS`, `ORDENANZAS ...`, `RESOLUCIONES ...`, `REGLAMENTO ...`) se
  conservan en `seccionEnCurso` y nunca se copian a `institucion`. Los demás
  encabezados sostenidos actualizan `institucionEnCurso` y cierran la sección
  anterior. Dentro de una sección, un prefijo explícito antes de `:` identifica
  la institución concreta de la entrada; si no existe evidencia institucional,
  `institucion` queda `null` con `INSTITUCION_NO_DETECTADA`. Un párrafo
  narrativo con minúsculas nunca reemplaza ninguno de estos estados.
- **El contexto determina el alcance de un prefijo institucional**: fuera de
  una sección estructural solo se acepta el vocabulario administrativo
  acotado ya definido, para evitar convertir prosa en institución. Dentro de
  una sección, un prefijo explícito de la misma entrada antes de `:` puede
  identificar una institución legítima no incluida en esa lista (por ejemplo,
  `Cuerpo de Bomberos de Cayambe:`); un párrafo narrativo separado, aunque
  termine en `:`, se ignora y no reemplaza la institución.
- **`confianza = 1` para toda entrada aceptada**: expresa certeza de que el
  segmento *es* una entrada legal real (tiene una referencia de publicación
  reconocible), no completitud de sus campos. Un `tipo`/`numero`/`institución`
  no detectado se expresa con advertencias, nunca reduciendo `confianza` ni
  inventando un valor.
- **Build orquestado una sola vez, fuera de los workers de Jest**: las
  pruebas del CLI y la integral necesitan el binario compilado (`leerPdf`
  requiere un `import()` dinámico real, que el sandbox VM de Jest no
  soporta sin `--experimental-vm-modules` global; en su lugar ejecutan el
  CLI compilado como proceso hijo de un solo uso). Ninguna suite decide
  compilar por sí misma — evita builds concurrentes entre archivos de test
  y evita validar un `dist` obsoleto por error de secuencia. Cada comando
  público de la raíz (`npm test`, `npm run test:infraestructura` y
  `npm run test:extractor`) compila una sola vez y delega en una variante
  interna `*:compilado` que no vuelve a compilar. Así todos funcionan desde
  un árbol limpio sin builds anidados.
- **Fixture PDF canónico versionado en el repositorio**: el PDF piloto
  (índice mensual de mayo de 2026, 53 páginas, SHA-256
  `60187abe757ea62b76aecad357d96689be2704bcb5d2f7344bbba553361a705e`) vive en
  `packages/infraestructura/src/ingesta/extractor-registro-oficial/__tests__/fixtures/`.
  Es la referencia de integración inicial: los tests no dependen de red ni de
  descargar el PDF en cada corrida. No se agregan automáticamente índices
  mensuales futuros a este fixture.

## Fuera de alcance de este bloque

Descarga del PDF por URL (`urlResumenMensualRegistroOficial` viaja en el
payload pero no se descarga), envío automático del payload al backend
(`POST /ingesta/registro-oficial/resumenes`), OCR, LLM, scheduler/cron,
colas/workers, procesamiento masivo de múltiples índices mensuales,
modificación del contrato HTTP existente y cualquier escritura directa a
PostgreSQL. `EdicionRegistroOficial.urlPdf` sigue sin relación con
`urlResumenMensualRegistroOficial`: el índice mensual nunca es la fuente de
una Norma (ADR 0008, ADR 0009).

## Consecuencias

- El backend puede recibir por primera vez un lote generado por un extractor
  real, no solo por un lote construido a mano en pruebas, sin que el
  contrato de ingesta (ADR 0008) haya cambiado.
- El costo de mantenimiento del extractor es independiente del ciclo de
  despliegue del backend: es un binario/CLI que se ejecuta aparte y cuyo
  JSON de salida se audita antes de enviarse.
- Un cambio real de formato del índice mensual (otra diagramación,
  otra fuente tipográfica) puede requerir recalibrar la detección de
  columnas/párrafos; ese análisis debe hacerse contra evidencia real del PDF
  nuevo, nunca ajustando los números esperados del fixture existente para que
  los tests pasen.
- El extractor no reemplaza el trabajo editorial: sigue sin resolver
  duplicados, sin fusionar entradas y sin publicar — eso permanece en el
  flujo editorial de `/normas` (ADR 0008).
- La triple (`tipoPublicacionRegistroOficial`, `numeroPublicacionRegistroOficial`,
  `fechaPublicacionOficial`) que este bloque detecta y persiste en cada
  `EntradaDetectadaRegistroOficial` es exactamente lo que la resolución
  automática de fuentes (ADR 0009) consume para paginar por `loteId` las
  ediciones únicas de un lote de ingesta, sin recorrer sus Normas: el
  traspaso entre ambos bloques es esa triple ya persistida, no una consulta
  nueva sobre el extractor ni sobre el contrato de ingesta.

# Fase 5E — Población histórica controlada del Registro Oficial (runbook operativo)

Este documento es un protocolo **operativo**, no una decisión de arquitectura.
No introduce ni autoriza ningún cambio de código, dominio, persistencia,
schema, migraciones, contratos HTTP ni dependencias. Todas las capacidades
que usa ya existen y están cubiertas por Fase 5A–5D (ver
`docs/reglas-negocio.md`, secciones 14–17, y ADR 0011). El veredicto de la
auditoría técnica previa fue **APTO SIN CÓDIGO NUEVO**.

Colección Postman de referencia:
`postman/fase_5d_analisis_confirmacion_indice_mensual.json`, carpetas
`01`–`04`. La carpeta `04` es la continuación operativa real de este runbook
(consulta del lote confirmado y resolución de fuentes por `loteId`); no
depende de la colección Fase 5B.

---

## 1. Objetivo y alcance

Fase 5E es la **población histórica controlada** de la base de datos con
ediciones del Registro Oficial ya publicadas, mes a mes, usando
exclusivamente las capacidades ya implementadas en Fase 5A–5D.

Reglas de alcance, no negociables en este bloque:

- Cada operación procesa **exactamente un mes** (`periodoAnio`, `periodoMes`).
- **No existen rangos.** Nunca se envía `desde`/`hasta` ni una lista de
  meses en una sola solicitud.
- El operador puede **empezar por cualquier mes**. No hay obligación de
  comenzar por el mes más antiguo disponible ni de seguir un orden
  cronológico ascendente o descendente. Cada mes es independiente: el
  aislamiento por `(periodoAnio, periodoMes)` en la ingesta y por `loteId`
  en la resolución de fuentes garantiza que procesar un mes no depende de
  haber procesado ningún otro antes.
- **No hay automatización de varios meses.** No existe scheduler, cron,
  worker, Redis ni colas en este flujo, y este runbook no introduce
  ninguno. Cada paso (Analizar, Confirmar, consultar lote, resolver una
  página de fuentes) es una acción manual y consciente del operador.
- La **fecha inicial de cobertura histórica** (el mes más antiguo con PDF
  real disponible) **no se investiga en este bloque**. Ver sección 12.

## 2. Precondiciones

Antes de ejecutar cualquier paso que escriba o descargue:

1. **Entorno identificado explícitamente.** Confirma contra qué backend
   apunta `{{baseUrl}}` (local, staging, producción) antes de enviar nada.
   Nunca asumas el entorno por defecto de la colección sin revisarlo.
2. **Backend configurado y accesible** con la persistencia que corresponda
   a ese entorno (memoria o Prisma/PostgreSQL real, según el despliegue).
3. **Usuario `SUPERADMINISTRADOR`** con credenciales válidas en ese
   entorno. `Analizar`, `Confirmar` y `resolver-pendientes` son exclusivos
   de ese rol; cualquier otro rol recibe `403`.
4. **URL oficial del PDF suministrada manualmente por el operador**, mes a
   mes. No existe ningún mecanismo que la derive, busque o complete
   automáticamente. Debe apuntar exactamente al hostname verificado
   (`https:`, hostname exacto, sin usuario/contraseña, sin puerto
   explícito — ver `docs/reglas-negocio.md` sección 17); cualquier otro
   host se rechaza con `400 URL_PDF_INDICE_NO_PERMITIDA` antes de
   descargar.
5. **Catálogo de resolución de fuentes** (`CATALOGO_REGISTRO_OFICIAL_HABILITADO`)
   solo necesita estar habilitado en el momento de ejecutar el paso 7
   (resolución por `loteId`). No es una precondición de `Analizar` ni de
   `Confirmar`: ambos funcionan sin el catálogo habilitado. Si no está
   habilitado, `resolver-pendientes` responde `503 CATALOGO_NO_DISPONIBLE`
   sin tocar ninguna edición.
6. **Confirma conscientemente el entorno antes de cualquier escritura.**
   `Analizar` nunca escribe (sección 3), pero `Confirmar` y
   `resolver-pendientes` sí. No ejecutes la carpeta `02` ni la `04` de la
   colección de forma automática o en lote contra un entorno que no hayas
   verificado a propósito.

## 3. Análisis

Request exacto (`POST /ingesta/registro-oficial/indices/analizar`, carpeta
`01` de la colección):

```
POST {{baseUrl}}/ingesta/registro-oficial/indices/analizar
Authorization: Bearer {{tokenSuperadmin}}
Content-Type: application/json

{
  "urlPdf": "<URL_OFICIAL_DEL_PDF>",
  "periodoEsperado": { "anio": <AAAA>, "mes": <M> }
}
```

Responde `200` con `{ analisis, entradasDetectadas }`. **No escribe nada**:
no crea lote, entradas, normas ni ediciones (garantía estructural, no solo
de comportamiento — ver `docs/reglas-negocio.md` sección 17,
"`Analizar`: previsualización sin escritura").

### Revisión humana obligatoria antes de decidir

Con la respuesta completa de `Analizar` en pantalla, el operador revisa:

- **Coincidencia del período**: si `analisis.periodoDetectado` no coincide
  con `analisis.periodoEsperado`, la solicitud ya falló con
  `422 PERIODO_INDICE_NO_COINCIDE` y no hay nada más que revisar en esa
  ejecución — pero antes de reintentar con otra URL/período, considera que
  el desajuste puede deberse a que se suministró la URL o el período
  equivocado, no necesariamente a un PDF con formato incompatible (ver
  sección 8, `BLOQUEADO_POR_FORMATO`).
- **Número de entradas** (`analisis.totalEntradas`): ¿es razonable para un
  mes del Registro Oficial? Un número muy bajo puede indicar que el
  extractor no reconoció el formato de ese PDF.
- **Advertencias** (`analisis.totalConAdvertencias`,
  `analisis.advertenciasPorTipo`): revisa qué códigos aparecen y con qué
  frecuencia (p. ej. `TIPO_NORMA_NO_DETECTADO`,
  `NUMERO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO`,
  `FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA`,
  `EDICION_REGISTRO_OFICIAL_NO_DETERMINADA`). Una concentración alta de
  advertencias en muchas entradas es una señal de formato mal interpretado.
- **Muestras visuales de `entradasDetectadas`**: revisa manualmente algunas
  entradas del **inicio**, del **centro** y del **final** de la lista
  (`entradasDetectadas` trae todas las entradas, sin muestreo, para que un
  mes incompatible no pueda ocultarse detrás de una muestra parcial).
  Compara `segmentoCrudo` contra el PDF real para confirmar que el
  extractor está leyendo el contenido correcto en cada tramo del
  documento, no solo al principio.
- **Posibles fusiones o fragmentaciones**: revisa si `posicion` tiene
  huecos o si varias entradas parecen ser en realidad una sola ficha
  jurídica partida (o al revés, una entrada que mezcla dos fichas). Esto
  es juicio humano sobre `segmentoCrudo`, no un campo calculado.
- **`sha256Pdf`** y **`versionExtractor`**: anótalos tal cual; son
  exactamente los valores que hay que reenviar sin modificar en
  `Confirmar`.

**No existe ni debe inventarse un umbral automático** de número de
entradas o de advertencias para aceptar o rechazar un mes. La decisión de
confirmar es siempre humana.

## 4. Decisión previa a confirmar

Tras la revisión de la sección 3, el operador toma exactamente una de estas
decisiones:

- **Aprobar**: la previsualización representa correctamente el PDF oficial
  de ese mes → continuar con `Confirmar` (sección 5).
- **Rechazar**: la URL o el período suministrados eran incorrectos (no es
  un problema de formato del extractor) → corregir el dato y volver a
  analizar; no se registra ningún estado operativo persistente para este
  caso, fue un error de entrada del operador.
- **Bloquear por formato** (`BLOQUEADO_POR_FORMATO`, sección 8): el PDF es
  el correcto para ese mes/período, pero el análisis no representa
  correctamente su contenido (formato histórico distinto al certificado).
  No se confirma. Se preserva evidencia (sección 10).
- **Reintentar por fallo técnico**: `Analizar` falló con una razón
  transitoria (`DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE`) o con un
  problema de origen no relacionado con el formato del contenido
  (`DESCARGA_INDICE_INVALIDA`) → reintentar la misma solicitud más tarde,
  sin cambiar nada del criterio de revisión.

## 5. Confirmación

Request exacto (`POST /ingesta/registro-oficial/indices/confirmar`,
carpeta `02` de la colección):

```
POST {{baseUrl}}/ingesta/registro-oficial/indices/confirmar
Authorization: Bearer {{tokenSuperadmin}}
Content-Type: application/json

{
  "urlPdf": "<URL_OFICIAL_DEL_PDF>",
  "periodoEsperado": { "anio": <AAAA>, "mes": <M> },
  "sha256PdfObservado": "<sha256Pdf de la respuesta de Analizar>",
  "versionExtractorObservada": "<versionExtractor de la respuesta de Analizar>"
}
```

`urlPdf` y `periodoEsperado` deben ser exactamente los mismos que se
usaron en `Analizar`; `sha256PdfObservado` y `versionExtractorObservada`
son los valores que devolvió esa misma llamada a `Analizar`, reenviados
tal cual. `Confirmar` vuelve a descargar el PDF desde cero (nunca reutiliza
bytes de un análisis previo) y vuelve a extraer; si algo cambió entre el
análisis y la confirmación, falla antes de escribir nada:

- **`creado: true`**: no existía ningún lote para ese `(periodoAnio,
  periodoMes)`; se creó uno nuevo con sus entradas y normas BORRADOR.
- **`creado: false`**: ya existía un lote con la misma huella exacta para
  ese período (mismo período + misma URL + misma versión de extractor +
  mismas entradas); se reutilizó el existente sin duplicar nada. Este es
  el resultado esperado de un reintento idéntico deliberado.
- **Cambio de versión del extractor** (`versionExtractorObservada` ya no
  coincide con la versión actual del extractor) → `409
  VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS`, verificado **antes** de
  descargar. Vuelve a `Analizar` para obtener la versión vigente.
- **Cambio del PDF** (el SHA-256 recién descargado no coincide con
  `sha256PdfObservado`) → `409 PDF_INDICE_CAMBIO_DESDE_ANALISIS`,
  verificado **antes** de extraer. El sitio oficial modificó el archivo
  entre el análisis y la confirmación; vuelve a `Analizar` sobre el PDF
  actual y revisa de nuevo antes de confirmar.
- **Conflicto de ingesta** (`409 EJECUCION_INGESTA_CONFLICTIVA`): ya existe
  un lote para ese mismo `(periodoAnio, periodoMes)` con una huella
  distinta (por ejemplo, con otra URL). No se sobrescribe nunca: hay que
  investigar manualmente por qué ese mes ya tiene un lote distinto antes
  de continuar.
- **`lote.id` (`loteId`)**: se conserva siempre, tanto si `creado` es
  `true` como `false`. Es el valor que se usa en todos los pasos
  siguientes (consulta del lote, resolución de fuentes) y el que la
  colección Postman guarda automáticamente en `{{loteIdConfirmado}}`.

## 6. Consulta del lote

Request exacto (`GET /ingesta/registro-oficial/lotes/:id`, carpeta `04`,
solicitud 1, de la colección):

```
GET {{baseUrl}}/ingesta/registro-oficial/lotes/{{loteIdConfirmado}}
Authorization: Bearer {{tokenSuperadmin}}
```

Campos a verificar en la respuesta antes de pasar a resolver fuentes:

- `periodoAnio` / `periodoMes`: confirman que el lote corresponde al mes
  que se acaba de confirmar.
- `totalEntradasDetectadas` / `totalConAdvertencias`: deben coincidir con
  lo observado en la respuesta de `Analizar`/`Confirmar` para ese mismo
  lote (son las mismas entradas, ya persistidas).
- `entradasDetectadas`: lista completa, anidada, para trazabilidad
  editorial posterior (no es necesaria para decidir sobre la resolución de
  fuentes, pero es la evidencia persistida de ese lote).

## 7. Resolución de fuentes por lote

Después de confirmar, las fuentes (`urlPdf` de cada `EdicionRegistroOficial`
detectada por el lote) se resuelven **exclusivamente por `loteId`**, en
páginas de hasta 20, contra `POST /ediciones-registro-oficial/resolver-pendientes`
(carpeta `04`, solicitudes 2–4 de la colección).

**Primera página** (sin `cursor`):

```json
{
  "loteId": "<LOTE_ID>",
  "limite": 20
}
```

**Página siguiente** (con el `siguienteCursor` que devolvió la página
anterior):

```json
{
  "loteId": "<LOTE_ID>",
  "limite": 20,
  "cursor": "<SIGUIENTE_CURSOR>"
}
```

**Reintento posterior** (más tarde, cuando quedaron pendientes técnicos —
ver `PENDIENTE_DE_REINTENTO` en la sección 8): mismo cuerpo que la primera
página, **sin `cursor`**:

```json
{
  "loteId": "<LOTE_ID>",
  "limite": 20
}
```

Reglas de ejecución:

- **Continúa mientras `hayMas === true`**, usando en cada llamada el
  `siguienteCursor` que devolvió la llamada anterior.
- **Acumula los contadores de cada página** (`resueltas`, `noEncontradas`,
  `conflictivas`, `erroresCatalogo`) en el reporte mensual externo
  (sección 9) a medida que llegan. Cada página es un evento que ocurrió
  una sola vez; el reporte externo es la única fuente de verdad de esos
  totales acumulados (ver advertencia de la sección 8 sobre
  `CERRADO`/`CERRADO_CON_EXCEPCIONES`).
- **No modifiques el cursor.** Es un valor opaco devuelto por el servidor;
  reenvíalo exactamente tal cual, sin editarlo ni recortarlo.
- **No reutilices un cursor de otro lote.** El cursor es un valor opaco
  (Base64URL de un JSON versionado) que incluye el `loteId` de origen; no
  lleva firma ni HMAC, pero el servidor lo valida estructuralmente de
  forma estricta (round-trip canónico, versión y forma exactas) y compara
  ese `loteId` contra el de la solicitud actual — un cursor mal formado o
  perteneciente a otro lote nunca se trata como "sin cursor": devuelve
  `400 SOLICITUD_INVALIDA`, nunca una página de otro lote.
- **Si `hayMas === false` y `pendientesRestantesLote > 0`**, el recorrido
  de esta ejecución terminó pero quedaron ediciones `PENDIENTE` por fallos
  técnicos o de cobertura del catálogo (nunca por falta de espacio en la
  página). El reintento posterior empieza de nuevo desde el inicio del
  lote, **sin cursor** (ver el request "Reintentar más tarde" arriba).
- **Los estados terminales nunca se reprocesan.** Una edición ya
  `RESUELTA`, `MANUAL`, `NO_ENCONTRADA` o `CONFLICTIVA` no vuelve a
  consultarse contra el catálogo, ni siquiera al reintentar desde el
  inicio del lote: por eso reintentar no duplica trabajo ni vuelve a
  contar como resuelta una edición que ya lo estaba.
- **Una edición compartida resuelve varias normas.** Varias entradas del
  mismo lote (o de lotes distintos) pueden compartir la misma
  `EdicionRegistroOficial` por su triple (tipo, número, fecha); resolver
  esa edición una sola vez resuelve el `urlPdf` para todas las normas
  asociadas a ella.
- **Sin loop automático.** La continuación por cursor no se automatiza: no
  existe ni se introduce ningún mecanismo que encadene varias páginas en
  una sola ejecución. Cada página es una solicitud manual independiente,
  revisada por el operador antes de enviar la siguiente.
- **Los acumulados de la colección Postman son solo una ayuda de sesión**
  (`acumuladoResueltas`, `acumuladoNoEncontradas`, `acumuladoConflictivas`,
  `acumuladoErroresCatalogo`), no la fuente de verdad: una reejecución
  accidental de la misma página los duplicaría, porque no hay forma
  confiable de detectar ese reenvío solo con el estado disponible en la
  colección. El reporte mensual externo (sección 9), llenado a mano tras
  leer cada respuesta completa, es la única fuente de verdad de los
  totales acumulados del mes.

## 8. Estados operativos

Los cinco estados operativos aprobados se derivan por completo de las
respuestas HTTP ya existentes (`Confirmar`, `resolver-pendientes`) más el
reporte mensual acumulado por el operador (sección 9). **No requieren
ninguna columna, tabla ni migración nueva.**

### `BLOQUEADO_POR_FORMATO`

El análisis no representa correctamente el documento y el operador decide
no confirmar. Una diferencia de período (`PERIODO_INDICE_NO_COINCIDE`) **no
demuestra por sí sola** incompatibilidad de formato: también puede indicar
que se suministró la URL o el período equivocado (error de entrada del
operador, no del extractor). La clasificación exige revisión humana; no se
infiere automáticamente de ningún código de error.

- **Evidencia**: la respuesta completa de `Analizar` (o su ausencia de
  período coincidente) más el juicio del operador tras revisar
  `entradasDetectadas`/`advertenciasPorTipo` (sección 3).
- **Campos usados**: `analisis.periodoDetectado`, `analisis.totalEntradas`,
  `analisis.totalConAdvertencias`, `analisis.advertenciasPorTipo`,
  muestras de `entradasDetectadas[].segmentoCrudo`.
- **Decisión**: humana, siempre.
- **Siguiente acción**: preservar evidencia saneada (sección 10) y no
  reintentar automáticamente ese PDF hasta corregir el extractor por TDD.

### `CONFIRMADO_PENDIENTE_DE_FUENTES`

`Confirmar` devolvió un lote válido, pero la resolución de fuentes todavía
**no comenzó**, o **comenzó pero aún no terminó** el recorrido paginado y
los reintentos necesarios. **No exige haber ejecutado previamente ninguna
página de resolución** — un lote recién confirmado, sin ninguna llamada a
`resolver-pendientes` todavía, ya está en este estado.

- **Evidencia**: respuesta `201` de `Confirmar` con `lote.id`; opcionalmente
  una o más páginas de `resolver-pendientes` ya procesadas sin haber
  llegado a `hayMas === false`.
- **Campos usados**: `lote.id` (`Confirmar`); si hay páginas previas,
  `hayMas` de la última.
- **Decisión**: automática de derivar (ausencia de una llamada terminal a
  `resolver-pendientes` con `hayMas === false`).
- **Siguiente acción**: ejecutar (o continuar) la resolución por `loteId`
  (sección 7).

### `PENDIENTE_DE_REINTENTO`

Se completó el recorrido paginado actual (`hayMas === false` en la última
página procesada), **pero**: `pendientesRestantesLote > 0` **y** existen
fallos técnicos o de cobertura del catálogo (`erroresCatalogo > 0` en
alguna página, o el reporte acumulado registra razones como
`CATALOGO_TEMPORALMENTE_NO_DISPONIBLE`, `RESPUESTA_CATALOGO_INVALIDA`,
`COBERTURA_CATALOGO_NO_DISPONIBLE` o `BUSQUEDA_CATALOGO_INCOMPLETA`) que
conservaron ediciones `PENDIENTE`. El próximo intento **comienza sin
cursor**, desde el inicio del lote (sección 7).

- **Evidencia**: última página de `resolver-pendientes` de ese lote con
  `hayMas: false` y `pendientesRestantesLote > 0`.
- **Campos usados**: `hayMas`, `pendientesRestantesLote`,
  `erroresPorRazon`/`erroresCatalogo` acumulados del mes.
- **Decisión**: automática de derivar de esos dos campos.
- **Siguiente acción**: programar un reintento posterior (sin fecha fija
  obligatoria; a discreción operativa) usando el request "Reintentar más
  tarde" sin cursor.

### `CERRADO_CON_EXCEPCIONES`

Se cumple **todo** lo siguiente:

- `hayMas === false` en la última página procesada;
- `pendientesRestantesLote === 0`;
- el **reporte acumulado del mes** (no una sola página) contiene al menos
  una edición `NO_ENCONTRADA` o `CONFLICTIVA`.

**No debe definirse como un mes con pendientes técnicos** — eso es
`PENDIENTE_DE_REINTENTO`. `CERRADO_CON_EXCEPCIONES` es un cierre completo
(nada queda `PENDIENTE`) que, sin embargo, dejó resultados definitivos no
resueltos (`NO_ENCONTRADA`/`CONFLICTIVA`), los cuales requieren corrección
editorial manual posterior (fuera del alcance de Fase 5E), no un
reintento automático.

- **Evidencia**: `pendientesRestantesLote === 0` en la página final, más
  el conteo acumulado de `noEncontradas`/`conflictivas` de **todas** las
  páginas del mes registradas en el reporte externo.
- **Campos usados**: `hayMas`, `pendientesRestantesLote` (última página),
  `noEncontradas`/`conflictivas` (acumulados de todas las páginas).
- **Decisión**: automática de derivar, **siempre que el reporte acumulado
  esté completo** (ver advertencia más abajo).
- **Siguiente acción**: ninguna dentro de Fase 5E; queda para corrección
  editorial manual de esas ediciones específicas.

### `CERRADO`

Se cumple **todo** lo siguiente:

- `hayMas === false`;
- `pendientesRestantesLote === 0`;
- el reporte acumulado **no** contiene ninguna edición `NO_ENCONTRADA`;
- el reporte acumulado **no** contiene ninguna edición `CONFLICTIVA`.

- **Evidencia**: igual que `CERRADO_CON_EXCEPCIONES`, pero con
  `noEncontradas` y `conflictivas` acumulados en cero.
- **Campos usados**: los mismos cuatro campos anteriores.
- **Decisión**: automática de derivar, con la misma advertencia sobre el
  reporte acumulado.
- **Siguiente acción**: ninguna. El mes queda operativamente cerrado.

### Advertencia obligatoria sobre acumulación

`resolver-pendientes` reporta `resueltas`, `noEncontradas`, `conflictivas`
y `erroresCatalogo` **por página**, no como un total histórico del lote.
**Los contadores de cada página deben acumularse en el reporte mensual
externo a medida que se procesan.** Una llamada posterior que ya no
encuentra pendientes (`procesadas: 0`, todo ya terminal) **no permite
reconstruir por sí sola** cuántas ediciones fueron `NO_ENCONTRADA` o
`CONFLICTIVA` en páginas anteriores — esa información solo existió en las
respuestas ya recibidas. **No se deben perder ni sobrescribir las
respuestas acumuladas de páginas anteriores**: guarda cada respuesta
completa (saneada, sección 9) en el reporte mensual antes de pasar a la
página siguiente.

### Lotes antiguos sin historial operativo

Si se intenta clasificar el estado de un lote confirmado en el pasado y
**no existe el reporte acumulado de sus páginas de resolución**, no se debe
inventar el estado a partir de una única consulta actual (una llamada
nueva a `resolver-pendientes` sin cursor solo muestra el estado *presente*
de lo que sigue `PENDIENTE`, nunca cuántas ediciones fueron
`NO_ENCONTRADA`/`CONFLICTIVA` en el pasado, porque esos estados son
terminales y ya no se reprocesan). En ese caso, **exige revisión manual de
la evidencia disponible** (el catálogo actual de `GET
/ediciones-registro-oficial` filtrado por las ediciones de ese lote,
correlacionado manualmente) antes de asignarle cualquiera de los cinco
estados.

## 9. Plantilla de reporte mensual

Reporte externo (hoja de cálculo, documento, o el medio operativo que se
decida — **no se persiste en la base de datos**, decisión 20 de Fase 5E).
Una fila o sección por mes procesado, con como mínimo:

| Campo | Fuente |
|---|---|
| Período (`AAAA-MM`) | `periodoEsperado`/`periodoDetectado` |
| Fecha de la operación | reloj del operador |
| Entorno (local / staging / producción) | precondición sección 2 |
| Operador | quien ejecuta |
| Hostname del origen (**nunca la URL completa**) | ver sección 11 |
| SHA-256 del PDF | `sha256Pdf` |
| Versión del extractor | `versionExtractor` |
| Total de páginas del PDF | `analisis.totalPaginas` |
| Total de entradas | `analisis.totalEntradas` |
| Total con advertencias | `analisis.totalConAdvertencias` |
| Advertencias por tipo | `analisis.advertenciasPorTipo` |
| Decisión del análisis (aprobar/rechazar/bloquear/reintentar) | sección 4 |
| `loteId` | `lote.id` (Confirmar) |
| `creado` (true/false) | `Confirmar` |
| Tabla por página de resolución (página, `procesadas`, `resueltas`, `noEncontradas`, `conflictivas`, `erroresCatalogo`, `hayMas`) | cada respuesta de `resolver-pendientes` |
| Totales acumulados del mes (`resueltas`, `noEncontradas`, `conflictivas`, `erroresCatalogo`) | suma manual de la tabla anterior |
| Fallos técnicos observados (razón, página) | `erroresPorRazon` de cada página |
| Ediciones `NO_ENCONTRADA` (cuántas, no cuáles PDFs) | acumulado de `noEncontradas` |
| Ediciones `CONFLICTIVA` (cuántas) | acumulado de `conflictivas` |
| Estado operativo final (sección 8) | derivado |
| Próxima acción | derivada del estado |
| Fecha del próximo reintento (si aplica) | a discreción operativa |

## 10. Formato histórico incompatible

Si en la sección 4 se decide **bloquear por formato**, el ciclo a seguir
es:

1. **No confirmar** ese mes.
2. **Conservar evidencia autorizada y saneada**: el PDF fuente y la
   respuesta completa de `Analizar`, sin URLs con token ni credenciales
   (sección 11) — nunca el PDF ni la respuesta con la URL completa sin
   sanear.
3. **Crear una prueba de caracterización** que reproduzca el fallo real
   observado, contra el parser de Fase 5C (`packages/infraestructura/src/
   ingesta/extractor-registro-oficial/parser-indice-mensual.ts` y su
   suite de tests), usando ese PDF concreto como fixture autorizado.
4. **Corregir mediante TDD**: ajuste mínimo del parser para ese caso real,
   nunca para casos hipotéticos no observados.
5. **Mantener verdes los fixtures existentes** (en particular el fixture
   real de mayo de 2026, 869 entradas) como regresión obligatoria del
   ajuste.
6. **Volver a analizar** el mismo mes histórico con el extractor
   corregido.
7. **Confirmar solo después de una nueva revisión humana** completa
   (sección 3) sobre el resultado del extractor ya corregido.

Este runbook **no inventa compatibilidades históricas** ni modifica el
extractor: ese trabajo, si llega a ser necesario, es un bloque de código
aparte, con su propio ciclo TDD sobre evidencia real.

## 11. Seguridad

- **No copiar la URL completa** del PDF a ningún reporte, ticket, chat o
  documento externo. La URL puede llevar un token de acceso en el query
  string.
- **No copiar el query string** por separado tampoco, aunque se omita el
  resto de la URL.
- **No copiar ningún token** ni credencial en los reportes.
- **No incluir credenciales** (contraseñas, tokens de sesión, `Authorization`
  headers) en ningún reporte ni evidencia conservada.
- El reporte mensual (sección 9) registra únicamente el **hostname**
  (siempre el mismo, fijo y sin token:
  `esacc.corteconstitucional.gob.ec`), nunca la URL completa.
- Si una respuesta completa (de `Analizar` o `Confirmar`) debe conservarse
  para diagnóstico de un formato bloqueado (sección 10), debe **sanearse
  antes de guardarla** (eliminar el campo `urlPdf`/query string de la
  solicitud, o reemplazarlo por el hostname) o permanecer únicamente en un
  almacenamiento interno de acceso restringido ya existente en la
  organización. **Este runbook no diseña ni implementa ese almacenamiento.**
- **No ejecutar la colección Postman completa automáticamente** contra un
  entorno real (ningún runner tipo Newman contra un servidor real, ninguna
  ejecución en lote de la carpeta `04`). Las solicitudes que descargan un
  PDF real (`Analizar`, `Confirmar`) o que pueden consultar el catálogo
  oficial real (`resolver-pendientes`) deben ejecutarse **individualmente
  y de manera consciente**, una por una, revisando la respuesta antes de
  continuar.
- Ningún documento de este bloque (runbook ni Postman) contiene una URL
  oficial real ni un token de ejemplo.

## 12. Cobertura histórica futura (fuera de este bloque)

- Operar cualquier mes **no necesita conocer el mes más antiguo**
  disponible: cada mes se procesa de forma aislada, sin depender de haber
  procesado ningún otro.
- El año inicial del árbol de navegación del catálogo (2001, ver
  `packages/infraestructura/src/normas/catalogo/registro-oficial-taxonomias.ts`)
  **no demuestra que existan PDFs descargables reales en todos esos
  meses** — es la cobertura de la taxonomía de navegación del sitio, un
  dato distinto de qué archivos existen realmente.
- La **medición global de cobertura histórica** (qué meses/años tienen
  realmente un PDF disponible) queda **diferida**: no se investiga como
  parte de este bloque documental y operativo.

## 13. `GET /ingesta/registro-oficial/lotes`: N+1 resuelto por consulta batch

`GET /ingesta/registro-oficial/lotes` no acepta paginación ni filtros: lista
todos los lotes existentes. Su implementación
(`packages/aplicacion/src/ingesta/casos-uso/ConsultarLotesIngestaRegistroOficial.ts`)
antes consultaba las entradas de cada lote por separado (una consulta
adicional por cada lote listado, N+1). Esto quedó **resuelto** mediante una
consulta batch única: `RepositorioIngestaRegistroOficial.listarEntradasPorLoteIds`
trae en una sola llamada (`findMany` con `loteId IN (...)` en el adaptador
Prisma) las entradas de todos los lotes devueltos por `listarLotes()`, y el
caso de uso las agrupa en memoria por `loteId` antes de armar los resúmenes.
El contrato HTTP (autorización, status, orden, shape JSON, métricas) no
cambió. La ausencia de paginación en el endpoint (todos los lotes en una
sola respuesta) sigue siendo una limitación conocida, no bloqueante para
procesar un mes individual, y queda fuera de este bloque.

---

## Referencias

- `docs/reglas-negocio.md`, secciones 14–18.
- `docs/arquitectura/decisiones/0011-analisis-confirmacion-indice-mensual-api-first.md`.
- `postman/fase_5d_analisis_confirmacion_indice_mensual.json` (carpetas
  `00`–`04`).

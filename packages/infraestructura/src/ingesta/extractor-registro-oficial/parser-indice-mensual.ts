/**
 * Parser puro del índice mensual del Registro Oficial: convierte el texto
 * posicional de un PDF (`PaginaLeida[]`, ver `modelo-lectura-visual.ts`) en
 * entradas del contrato de ingesta (`EntradaParseada`), respetando el orden
 * de lectura visual del documento.
 *
 * No depende de PDF.js, NestJS, Prisma ni HTTP: solo de los tipos puros de
 * este módulo y de los modelos de aplicación reutilizados para el contrato
 * (`PublicacionRegistroOficialDetectada`, `TIPOS_PUBLICACION_REGISTRO_OFICIAL`).
 */

import { TIPOS_PUBLICACION_REGISTRO_OFICIAL } from '@normativo/aplicacion';
import type { PublicacionRegistroOficialDetectada } from '@normativo/aplicacion';
import type { PaginaLeida, PalabraPosicionada } from './modelo-lectura-visual';
import type {
  EntradaParseada,
  ResultadoParseoDocumento,
} from './modelo-entrada-parseada';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DIAS_SEMANA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const REGEX_REFERENCIA_PUBLICACION = new RegExp(
  '\\b(\\d?[A-Z]{1,4})\\.?\\s+(\\d{1,5})\\s+' +
    `(?:(${DIAS_SEMANA.join('|')})\\s+)?` +
    `(\\d{1,2})\\s+de\\s+(${MESES.join('|')})\\s+de\\s+(\\d{4})`,
  'g',
);

const MARCADORES_TIPO_NORMA: Array<{ patron: RegExp; tipo: string }> = [
  { patron: /\bRes\./g, tipo: 'Resolución' },
  { patron: /\bAcdo\./g, tipo: 'Acuerdo' },
  { patron: /\bOrd\./g, tipo: 'Ordenanza' },
  { patron: /\bSent\./g, tipo: 'Sentencia' },
  { patron: /\bDctmn\./g, tipo: 'Dictamen' },
  { patron: /\bDcto\./g, tipo: 'Decreto' },
  { patron: /\bAuto\./g, tipo: 'Auto' },
  { patron: /\bLey\b/g, tipo: 'Ley' },
];

/** Prefijos institucionales/geográficos que son evidencia suficiente por sí
 * solos, incluso fuera de una sección estructural. Dentro de una sección
 * (`ORDENANZAS ...`, `RESOLUCIONES ...`, etc.), cualquier prefijo inicial
 * explícito antes de ":" identifica a la institución concreta de esa entrada:
 * la sección ya aporta el contexto que evita confundir una frase narrativa
 * intermedia con una institución. */
const PREFIJOS_GEOGRAFICO_INSTITUCIONALES = [
  'Cantón',
  'Concejo del Distrito Metropolitano de',
  'Distrito Metropolitano de',
  'Provincia de',
  'Municipio de',
  'Municipio del',
  'Gobierno Provincial de',
  'Gobierno Provincial del',
  'Gobierno Autónomo Descentralizado',
  'GAD',
  'Parroquia',
];

const REGEX_PREFIJO_INSTITUCION_CONFIABLE = new RegExp(
  `^(${PREFIJOS_GEOGRAFICO_INSTITUCIONALES.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})\\s+[^:]{1,60}:\\s*`,
);

const REGEX_PREFIJO_EXPLICITO_ENTRADA = /^([^:]{2,120}):\s*/u;

/** Encabezados que organizan grupos de entradas, pero no son organismos que
 * expiden la norma. Se reconocen por vocabulario estructural estable, no por
 * posiciones o frases específicas de una página del fixture. */
const REGEX_ENCABEZADO_SECCION =
  /^(?:AVISOS JUDICIALES|FE DE ERRATAS|ORDENANZAS?(?:\s+.+)?|RESOLUCIONES?(?:\s+.+)?|REGLAMENTOS?(?:\s+.+)?)$/u;

/**
 * Un encabezado real de este documento se distingue del cuerpo narrativo por
 * tipografía sostenida en mayúsculas. Esta función identifica la forma
 * tipográfica; `pareceEncabezadoSeccion` decide después si su función es
 * estructural o institucional.
 */
function pareceEncabezadoSostenido(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < 3) return false;
  const tieneLetra = /\p{L}/u.test(limpio);
  const tieneMinuscula = /\p{Ll}/u.test(limpio);
  return tieneLetra && !tieneMinuscula;
}

function pareceEncabezadoSeccion(texto: string): boolean {
  return REGEX_ENCABEZADO_SECCION.test(texto.replace(/:$/, '').trim());
}

function normalizarInstitucionExplicita(institucion: string): string {
  return institucion.replace(/\s+/g, ' ').trim();
}

/**
 * Señal de seguridad de solo lectura, nunca de reconstrucción: un texto ya
 * procesado con toda la evidencia geométrica disponible (huecos reales
 * entre TextItem, continuidad entre líneas) que aún así conserva una
 * transición de minúscula a mayúscula sin ningún espacio entre medio es
 * evidencia de que el extractor de PDF entregó ese fragmento como un único
 * TextItem sin ningún hueco interno que reconstruir. No inserta ningún
 * espacio ni intenta adivinar dónde partir el texto — solo decide que el
 * campo no es seguro de publicar tal cual. No depende de ningún nombre,
 * institución o frase de este documento en particular.
 */
function tieneGlueResidual(texto: string): boolean {
  return /\p{Ll}\p{Lu}/u.test(texto);
}

/** Segunda señal de seguridad, complementaria a `tieneGlueResidual`: esa
 * detecta la fusión entre una institución en Title Case y la siguiente
 * palabra (una transición de minúscula a mayúscula), pero un título
 * narrativo en minúscula-sentencia puede fusionarse por completo sin dejar
 * ninguna mayúscula intermedia (p. ej. "Seexpideelcálculo..."). En ese
 * caso, la única evidencia disponible es que la racha de letras sin ningún
 * espacio es más larga que cualquier palabra plausible en español (las
 * entradas más largas del diccionario de la RAE rondan las 24-25 letras);
 * un umbral claramente por encima de eso, aplicado por token y no al texto
 * completo, distingue una palabra real legítimamente larga de varias
 * palabras fusionadas sin evidencia geométrica de separación. */
const LONGITUD_MAXIMA_PALABRA_PLAUSIBLE = 28;

function tieneRachaDeLetrasImplausible(texto: string): boolean {
  return texto
    .split(/[^\p{L}]+/u)
    .some((token) => token.length > LONGITUD_MAXIMA_PALABRA_PLAUSIBLE);
}

/**
 * Forma canónica de identificador de causa/expediente usada en todo el
 * documento (p. ej. "78-21-IN", "1-26-OP", "186-25-IN"): dígitos, guion,
 * dígitos, guion, letras mayúsculas cortas. No es texto de este fixture en
 * particular — es la convención tipográfica del propio Registro Oficial
 * para este tipo de identificador, ya usada implícitamente por el resto del
 * parser (`REGEX_REFERENCIA_PUBLICACION`, `normalizarEspaciosIdentificador`).
 */
const REGEX_IDENTIFICADOR_TIPO_CAUSA = /\b\d{1,4}-\d{1,4}-[A-ZÑ]{1,6}\b/gu;

function identificadoresDistintos(texto: string): Set<string> {
  return new Set(texto.match(REGEX_IDENTIFICADOR_TIPO_CAUSA) ?? []);
}

/** Longitud mínima para que una cláusula cuente como una posible "fórmula
 * de apertura" repetida (evita que una coincidencia trivial de pocas
 * palabras cortas y comunes dispare una falsa alarma). */
const LONGITUD_MINIMA_CLAUSULA_APERTURA = 15;

/**
 * Busca, dentro de un mismo párrafo, dos cláusulas (separadas por "." o
 * ":") donde una es exactamente igual a otra, o termina exactamente con el
 * texto completo de otra — sin importar qué prefijo tenga delante (p. ej.
 * un identificador suelto insertado antes). Una fórmula de apertura de
 * entrada jurídica que se repite palabra por palabra dentro del mismo
 * párrafo es evidencia genérica y puramente textual de que el párrafo
 * contiene dos cláusulas jurídicas distintas, sin depender de qué dice esa
 * fórmula en particular ni de ningún vocabulario de este documento.
 */
function tieneClausulaDeAperturaRepetida(texto: string): boolean {
  const clausulas = texto
    .split(/(?<=[.:])\s+/u)
    .map((c) => c.trim())
    .filter((c) => c.length >= LONGITUD_MINIMA_CLAUSULA_APERTURA);

  for (let i = 0; i < clausulas.length; i++) {
    for (let j = 0; j < i; j++) {
      if (
        clausulas[i] === clausulas[j] ||
        clausulas[i].endsWith(clausulas[j]) ||
        clausulas[j].endsWith(clausulas[i])
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Señal fail-closed de posible fusión de dos entradas dentro de un mismo
 * párrafo: exige DOS evidencias genéricas a la vez —una cláusula de
 * apertura que se repite textualmente Y al menos dos identificadores de
 * causa distintos en el cuerpo—, nunca una sola por separado. Esto excluye
 * deliberadamente:
 * - un caso acumulado legítimo que menciona varios identificadores pero no
 *   repite ninguna cláusula de apertura;
 * - una norma que reforma o deroga otra y cita su identificador una sola
 *   vez, sin repetir ninguna cláusula;
 * - la reafirmación del MISMO número dentro de una sola cláusula real
 *   ("En el Caso No. X ... protección No. X."), donde no hay una segunda
 *   cláusula de apertura completa repetida, solo el mismo número suelto.
 *
 * Validado contra las 869 entradas reales del fixture piloto: cero falsos
 * positivos, un único verdadero positivo (el párrafo con dos cláusulas de
 * "Acción Pública de Inconstitucionalidad" e identificadores en conflicto).
 * No depende de ninguna posición, página, nombre propio ni identificador
 * concreto de ese fixture.
 */
function detectarPosibleFusionEntradas(cuerpoParaTitulo: string): boolean {
  if (!tieneClausulaDeAperturaRepetida(cuerpoParaTitulo)) {
    return false;
  }
  return identificadoresDistintos(cuerpoParaTitulo).size >= 2;
}

function extraerPrefijoInstitucion(
  texto: string,
  existeSeccionEnCurso: boolean,
): { textoCompleto: string; institucion: string } | null {
  const prefijo = REGEX_PREFIJO_EXPLICITO_ENTRADA.exec(texto);
  if (prefijo === null) return null;

  const esConfiableFueraDeSeccion =
    REGEX_PREFIJO_INSTITUCION_CONFIABLE.test(texto);
  if (!existeSeccionEnCurso && !esConfiableFueraDeSeccion) {
    return null;
  }

  return {
    textoCompleto: prefijo[0],
    institucion: normalizarInstitucionExplicita(prefijo[1]),
  };
}

/**
 * Normaliza únicamente espacios de maquetación alrededor de "-" y "/"
 * dentro de un identificador ya extraído (nunca en `segmentoCrudo`): PDF.js
 * a veces entrega un identificador partido en fragmentos por un salto de
 * línea o de columna dentro de la misma entrada (p. ej. "UAFE-" al final de
 * una línea y "DG-2026-0007" al inicio de la siguiente), y al unir líneas
 * con un espacio normal ese espacio queda pegado al guion. Los demás
 * espacios se dejan intactos en este paso; la canonicalización posterior
 * decide de forma acotada si corresponden a una etiqueta editorial.
 */
function normalizarEspaciosIdentificador(numero: string): string {
  return numero.replace(/\s*([-/])\s*/g, '$1');
}

/** Proyecta únicamente el identificador canónico, sin etiquetas editoriales
 * ("Caso", "de causa.") ni repeticiones exactas introducidas por la fuente.
 * Las transformaciones son deliberadamente acotadas: otros espacios internos
 * se conservan porque pueden formar parte del identificador oficial. */
function normalizarIdentificadorCanonico(
  numero: string,
  tipo: string,
): string | null {
  let normalizado = normalizarEspaciosIdentificador(numero).trim();

  if (tipo === 'Resolución') {
    normalizado = normalizado.replace(
      /^(?:n[uú]mero\s+)?de\s+causa\.\s*/iu,
      '',
    );
  }
  if (tipo === 'Auto') {
    normalizado = normalizado.replace(/^caso\s+/iu, '');
  }

  const repetido = /^(.+?)\.\s+\1$/u.exec(normalizado);
  if (repetido !== null) {
    normalizado = repetido[1].trim();
  }

  return /[\p{L}\p{N}]/u.test(normalizado) ? normalizado : null;
}

interface ReferenciaEncontrada {
  indice: number;
  tipoCrudo: string;
  numero: number;
  fecha: string | null; // ISO yyyy-mm-dd cuando la fecha calendario es real
  diaSemanaCapturado: string | null;
  diaSemanaConsistente: boolean;
}

function analizarReferencias(texto: string): ReferenciaEncontrada[] {
  const referencias: ReferenciaEncontrada[] = [];
  for (const match of texto.matchAll(REGEX_REFERENCIA_PUBLICACION)) {
    const [, tipoCrudo, numeroTexto, diaSemana, diaTexto, mesTexto, anioTexto] =
      match;
    const anio = Number(anioTexto);
    const mesIndice = MESES.indexOf(mesTexto);
    const dia = Number(diaTexto);
    const fechaCruda = `${anio}-${String(mesIndice + 1).padStart(2, '0')}-${String(
      dia,
    ).padStart(2, '0')}`;
    const fecha = esFechaCalendarioReal(fechaCruda) ? fechaCruda : null;

    let diaSemanaConsistente = true;
    if (diaSemana && fecha !== null) {
      const indiceEsperado = new Date(Date.UTC(anio, mesIndice, dia)).getUTCDay();
      diaSemanaConsistente = DIAS_SEMANA[indiceEsperado] === diaSemana;
    }

    referencias.push({
      indice: match.index ?? 0,
      tipoCrudo,
      numero: Number(numeroTexto),
      fecha,
      diaSemanaCapturado: diaSemana ?? null,
      diaSemanaConsistente,
    });
  }
  return referencias;
}

function esFechaCalendarioReal(valor: string): boolean {
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
}

function tipoValido(tipoCrudo: string): string | null {
  return (TIPOS_PUBLICACION_REGISTRO_OFICIAL as readonly string[]).includes(
    tipoCrudo,
  )
    ? tipoCrudo
    : null;
}

function referenciaAPublicacion(
  referencia: ReferenciaEncontrada,
): PublicacionRegistroOficialDetectada {
  return {
    tipo: tipoValido(referencia.tipoCrudo),
    numero: referencia.numero,
    fecha: referencia.fecha,
  };
}

interface DeteccionTipoNorma {
  tipo: string | null;
  numero: string | null;
  titulo: string | null;
}

/** Distancia máxima, en caracteres desde el inicio del texto de la entrada,
 * a la que debe aparecer el marcador "Ley" para tratarse como la propia
 * ley que la entrada anuncia (ver `detectarTipoNormaYTitulo`). No es una
 * medida de este documento en particular: es simplemente "cerca del
 * inicio" frente a "en medio de una descripción". */
const UMBRAL_INICIO_MARCADOR_LEY = 5;

/**
 * Elige, entre todos los marcadores jurídicos encontrados antes de la
 * referencia de publicación, el más cercano a esa referencia (el último en
 * el texto), no el primero que aparece en todo el párrafo. Un párrafo puede
 * mencionar "Ley" narrativamente mucho antes del marcador formal real
 * (p. ej. "... conforme a la Ley de Compañías. Res. BCE-GG-011-2026.");
 * el marcador que efectivamente antecede a la cita oficial es el que
 * determina tipo y número, no la primera palabra jurídica del texto.
 */
function encontrarMarcadorMasCercano(
  textoBusqueda: string,
): { indice: number; longitud: number; tipo: string } | null {
  let mejor: { indice: number; longitud: number; tipo: string } | null = null;
  for (const { patron, tipo } of MARCADORES_TIPO_NORMA) {
    patron.lastIndex = 0;
    let ultimo: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = patron.exec(textoBusqueda)) !== null) {
      ultimo = match;
    }
    if (ultimo && (mejor === null || ultimo.index > mejor.indice)) {
      mejor = { indice: ultimo.index, longitud: ultimo[0].length, tipo };
    }
  }
  return mejor;
}

function detectarTipoNormaYTitulo(
  textoCuerpo: string,
  indiceLimite: number | null,
): DeteccionTipoNorma {
  const finBusqueda = indiceLimite ?? textoCuerpo.length;
  const textoBusqueda = textoCuerpo.slice(0, finBusqueda);

  const mejor = encontrarMarcadorMasCercano(textoBusqueda);
  if (mejor === null) {
    return { tipo: null, numero: null, titulo: null };
  }

  if (mejor.tipo === 'Ley') {
    // Una Ley real anuncia la entrada desde el inicio ("Ley Orgánica
    // para..."): "Ley" es prácticamente la primera palabra del texto. Una
    // mención narrativa de una ley ya existente, en cambio, aparece lejos
    // del inicio, describiendo a qué norma se acoge un tercero (p. ej.
    // "... amparados por la Ley Orgánica del Servicio Público"), no
    // anunciando que esta entrada es esa ley. Sin un marcador propio cerca
    // del inicio no hay evidencia suficiente de que la entrada SEA una ley:
    // exigir cercanía al inicio evita esa falsa clasificación sin depender
    // de ninguna frase específica de este documento.
    if (mejor.indice > UMBRAL_INICIO_MARCADOR_LEY) {
      return { tipo: null, numero: null, titulo: null };
    }
    // Una Ley real no trae un identificador corto separable: el propio
    // marcador "Ley" es parte del nombre completo de la norma, no un
    // separador entre título e identificador. Sin evidencia textual de un
    // número explícito, queda null en vez de convertir una descripción en
    // número.
    const tituloCompleto = textoBusqueda.trim();
    return {
      tipo: 'Ley',
      numero: null,
      titulo: tituloCompleto.length > 0 ? tituloCompleto : null,
    };
  }

  const numeroCrudo = textoBusqueda
    .slice(mejor.indice + mejor.longitud, finBusqueda)
    .trim()
    .replace(/\.$/, '')
    .trim();

  if (numeroCrudo.length === 0) {
    return { tipo: null, numero: null, titulo: null };
  }

  const tituloCrudo = textoBusqueda.slice(0, mejor.indice).trim();
  const titulo = tituloCrudo.length > 0 ? tituloCrudo : null;

  return {
    tipo: mejor.tipo,
    numero: normalizarIdentificadorCanonico(numeroCrudo, mejor.tipo),
    titulo,
  };
}

interface Linea {
  y: number;
  x: number;
  texto: string;
  alto: number;
}

/** Agrupa palabras en filas físicas por proximidad vertical, sin unir
 * columnas ni construir texto todavía. Base compartida por `agruparEnLineas`
 * (texto por línea) y `detectarColumnasDePalabras` (perfil horizontal). */
function agruparFilasBrutas(palabras: PalabraPosicionada[]): PalabraPosicionada[][] {
  const filas: PalabraPosicionada[][] = [];
  const referenciaY: number[] = [];
  for (const palabra of palabras) {
    if (palabra.texto.trim().length === 0) continue;
    const indice = referenciaY.findIndex(
      (y) => Math.abs(y - palabra.yDesdeArriba) <= 2,
    );
    if (indice === -1) {
      filas.push([palabra]);
      referenciaY.push(palabra.yDesdeArriba);
    } else {
      filas[indice].push(palabra);
    }
  }
  return filas;
}

/** Separación horizontal mínima entre dos fragmentos de texto consecutivos
 * de la misma línea para asumir que hay un espacio real entre ellos, como
 * fracción de la altura de línea medida por el propio extractor (nunca un
 * valor absoluto propio de este documento). Por debajo de este umbral se
 * trata como el mismo token partido en dos fragmentos por el extractor de
 * PDF (kerning/subpíxeles), no como dos palabras distintas.
 *
 * Calibrado contra la distribución empírica completa de huecos entre
 * TextItem consecutivos del PDF piloto (6084 mediciones): el cúmulo de
 * fragmentos sin separación real no supera 0.134pt, y el cúmulo de
 * espacios de palabra genuinos empieza en 0.262pt. Con la altura de línea
 * uniforme de ese documento (11pt), este factor cae en 0.22pt — dentro de
 * ese hueco, sin depender de ningún valor absoluto ni de texto conocido de
 * este documento en particular. El umbral fijo anterior (1pt) fusionaba
 * espacios reales por debajo de 1pt, causando palabras pegadas.
 */
const FACTOR_SEPARACION_MINIMA_ESPACIO = 0.02;

function unirFragmentosDeLinea(ordenadas: PalabraPosicionada[]): string {
  let texto = '';
  let finAnterior: number | null = null;
  let altoAnterior: number | null = null;
  for (const p of ordenadas) {
    if (finAnterior !== null) {
      const umbral =
        Math.max(altoAnterior ?? p.alto, p.alto) *
        FACTOR_SEPARACION_MINIMA_ESPACIO;
      if (p.x - finAnterior >= umbral) {
        texto += ' ';
      }
    }
    texto += p.texto;
    finAnterior = p.x + p.ancho;
    altoAnterior = p.alto;
  }
  return texto.replace(/\s+/g, ' ').trim();
}

function agruparEnLineas(palabras: PalabraPosicionada[]): Linea[] {
  return agruparFilasBrutas(palabras)
    .map((fila) => {
      const ordenadas = [...fila].sort((a, b) => a.x - b.x);
      return {
        y: ordenadas.reduce((suma, p) => suma + p.yDesdeArriba, 0) / ordenadas.length,
        x: ordenadas[0].x,
        texto: unirFragmentosDeLinea(ordenadas),
        alto: moda(ordenadas.map((p) => p.alto)),
      };
    })
    .filter((linea) => linea.texto.length > 0)
    .sort((a, b) => a.y - b.y);
}

/** Ancho de cada bin del perfil de ocupación horizontal, en puntos. */
const ANCHO_BIN_PROYECCION = 2;
/** Separación mínima entre columnas para no confundirla con un espacio
 * normal entre palabras dentro de una misma línea. */
const UMBRAL_GUTTER_PT = 15;
/** Fracción de filas físicas que pueden "invadir" una franja y que aun así
 * se sigue considerando el corredor entre columnas (texto justificado
 * ocasionalmente roza el margen de la columna vecina en una línea suelta;
 * un corredor real sigue vacío en la gran mayoría de las filas). */
const DENSIDAD_MAXIMA_GUTTER = 0.08;

/**
 * Detecta las columnas de una página a partir de un perfil de densidad
 * horizontal: para cada franja vertical de la página, en qué fracción de
 * las filas físicas hay al menos una palabra que la toca. Busca la franja
 * más ancha, dentro del rango realmente ocupado por texto, cuya densidad es
 * consistentemente baja (un corredor entre columnas, no un espacio
 * ocasional entre palabras). Opera sobre las palabras crudas —antes de
 * construir texto de línea— porque agrupar por Y en una página de dos
 * columnas mezcla texto de columnas distintas que coinciden en altura por
 * casualidad.
 */
function detectarColumnasDePalabras(
  palabras: PalabraPosicionada[],
  anchoPagina: number,
): PalabraPosicionada[][] {
  const filas = agruparFilasBrutas(palabras);
  if (filas.length === 0) return [];

  const numBins = Math.ceil(anchoPagina / ANCHO_BIN_PROYECCION);
  const conteoPorBin = new Array<number>(numBins).fill(0);
  let primerBinOcupado = numBins;
  let ultimoBinOcupado = -1;

  for (const fila of filas) {
    const binsTocados = new Set<number>();
    for (const p of fila) {
      const inicio = Math.max(0, Math.floor(p.x / ANCHO_BIN_PROYECCION));
      const fin = Math.min(
        numBins - 1,
        Math.ceil((p.x + p.ancho) / ANCHO_BIN_PROYECCION),
      );
      for (let b = inicio; b <= fin; b++) binsTocados.add(b);
    }
    for (const b of binsTocados) {
      conteoPorBin[b]++;
      if (b < primerBinOcupado) primerBinOcupado = b;
      if (b > ultimoBinOcupado) ultimoBinOcupado = b;
    }
  }

  if (ultimoBinOcupado < primerBinOcupado) return [palabras];

  const minimoFilasParaOcupado = filas.length * DENSIDAD_MAXIMA_GUTTER;
  let mejorInicio = -1;
  let mejorLongitud = 0;
  let actualInicio = -1;
  for (let b = primerBinOcupado; b <= ultimoBinOcupado; b++) {
    if (conteoPorBin[b] <= minimoFilasParaOcupado) {
      if (actualInicio === -1) actualInicio = b;
      const longitud = b - actualInicio + 1;
      if (longitud > mejorLongitud) {
        mejorLongitud = longitud;
        mejorInicio = actualInicio;
      }
    } else {
      actualInicio = -1;
    }
  }

  const anchoFranjaVacia = mejorLongitud * ANCHO_BIN_PROYECCION;
  if (mejorInicio === -1 || anchoFranjaVacia < UMBRAL_GUTTER_PT) {
    return [palabras];
  }

  const corteX = (mejorInicio + mejorLongitud / 2) * ANCHO_BIN_PROYECCION;
  const izquierda = palabras.filter((p) => p.x < corteX);
  const derecha = palabras.filter((p) => p.x >= corteX);
  if (izquierda.length === 0 || derecha.length === 0) {
    return [palabras];
  }
  return [izquierda, derecha];
}

interface Parrafo {
  texto: string;
  /** Igual que `texto`, pero además reconstruye palabras partidas por un
   * guion de fin de línea dentro del mismo párrafo (ver
   * `unirLineasConDeshifenacion`). Nunca se usa para `segmentoCrudo` ni
   * para el cuerpo de la entrada — solo para clasificar y almacenar
   * encabezados institucionales/de sección, donde un guion de maquetación
   * nunca es parte del nombre real. */
  textoNormalizado: string;
  iniciaConGuion: boolean;
}

/** Una línea termina en un guion de corte de palabra (no uno semántico)
 * cuando el guion es el último carácter de la línea y está pegado, sin
 * espacio, a la letra anterior: así es como PDF.js entrega un guion de
 * partición de palabra por ancho de columna. Un guion semántico dentro de
 * la misma línea (p. ej. "ZONA - NORTE") nunca queda como último carácter
 * de la línea, así que este patrón no lo alcanza. */
const REGEX_GUION_FIN_DE_LINEA = /\p{L}-$/u;

/**
 * Reconstruye, dentro de un mismo párrafo, una palabra partida por un
 * salto de línea de maquetación: si una línea termina en un guion de corte
 * de palabra y el párrafo continúa en la línea siguiente, las une sin el
 * guion y sin insertar un espacio (la continuidad vertical entre líneas
 * consecutivas del mismo párrafo, ya validada por `segmentarParrafos`, es
 * la única evidencia geométrica que se usa — nunca el contenido textual).
 * Si la línea no termina en ese patrón, se une con un espacio normal, como
 * en `texto`.
 */
function unirLineasConDeshifenacion(lineasParrafo: Linea[]): string {
  let resultado = lineasParrafo[0]?.texto ?? '';
  for (let i = 1; i < lineasParrafo.length; i++) {
    const siguiente = lineasParrafo[i].texto;
    if (REGEX_GUION_FIN_DE_LINEA.test(resultado)) {
      resultado = resultado.slice(0, -1) + siguiente;
    } else {
      resultado = `${resultado} ${siguiente}`;
    }
  }
  return resultado;
}

/** Factor sobre la altura real de línea (medida por el extractor de PDF,
 * nunca una distancia absoluta propia de este documento), usado solo como
 * respaldo cuando no hay evidencia suficiente en la propia columna para
 * distinguir interlineado de salto de párrafo (ver `calcularUmbralParrafo`). */
const FACTOR_SALTO_PARRAFO_RESPALDO = 2.0;

/** Crecimiento relativo máximo tolerado dentro del grupo de "interlineado"
 * (ver `calcularUmbralParrafo`): un salto de párrafo real es sustancialmente
 * mayor que el interlineado, no un incremento marginal. */
const FACTOR_CRECIMIENTO_INTERLINEADO = 1.5;

/**
 * El salto de párrafo real varía ligeramente según la sección del
 * documento (se observó, p.ej., ~11pt de interlineado con ~22-25pt de salto
 * de párrafo en unas secciones, y ~11.2pt/~22pt en otras, con saltos
 * ocasionales aún mayores por transiciones de sección): un factor fijo
 * puede quedar más cerca de un valor que de otro, y buscar "el mayor salto
 * de toda la columna" falla cuando existe un salto todavía más grande que
 * el de párrafo (p.ej. una transición de sección), porque ese salto mayor
 * termina marcando el corte en el lugar equivocado.
 *
 * En su lugar, se parte del salto más pequeño observado (el interlineado
 * real) y se hace crecer ese grupo mientras los valores siguientes sean
 * cercanos entre sí (crecimiento relativo acotado); el primer salto que
 * rompe esa cercanía es un salto de párrafo, y el corte queda en el punto
 * medio. Solo si la columna no ofrece evidencia (todos los saltos
 * observados son iguales) se recurre al respaldo basado en la altura de
 * línea medida.
 */
function calcularUmbralParrafo(saltos: number[], alturaBase: number): number {
  if (saltos.length === 0) {
    return alturaBase * FACTOR_SALTO_PARRAFO_RESPALDO;
  }

  const valoresUnicos = [...new Set(saltos)].sort((a, b) => a - b);
  if (valoresUnicos.length === 1) {
    return alturaBase * FACTOR_SALTO_PARRAFO_RESPALDO;
  }

  let maximoDelGrupo = valoresUnicos[0];
  for (let i = 1; i < valoresUnicos.length; i++) {
    const valor = valoresUnicos[i];
    if (valor > maximoDelGrupo * FACTOR_CRECIMIENTO_INTERLINEADO) {
      return (maximoDelGrupo + valor) / 2;
    }
    maximoDelGrupo = valor;
  }

  // Todos los saltos observados son cercanos entre sí: no hay evidencia de
  // un salto de párrafo distinguible del interlineado en esta columna.
  return alturaBase * FACTOR_SALTO_PARRAFO_RESPALDO;
}

function segmentarParrafos(lineas: Linea[]): Parrafo[] {
  if (lineas.length === 0) return [];

  const alturaBase = moda(lineas.map((l) => l.alto));
  const saltos = lineas.slice(1).map((linea, i) => linea.y - lineas[i].y);
  const umbralParrafo = calcularUmbralParrafo(saltos, alturaBase);

  const grupos: Linea[][] = [[lineas[0]]];
  for (let i = 1; i < lineas.length; i++) {
    const salto = lineas[i].y - lineas[i - 1].y;
    if (salto > umbralParrafo) {
      grupos.push([lineas[i]]);
    } else {
      grupos[grupos.length - 1].push(lineas[i]);
    }
  }

  return grupos.map((lineasParrafo) => {
    const texto = lineasParrafo
      .map((l) => l.texto)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const textoNormalizado = unirLineasConDeshifenacion(lineasParrafo)
      .replace(/\s+/g, ' ')
      .trim();
    return { texto, textoNormalizado, iniciaConGuion: texto.startsWith('-') };
  });
}

function moda(valores: number[]): number {
  const conteos = new Map<number, number>();
  for (const v of valores) {
    conteos.set(v, (conteos.get(v) ?? 0) + 1);
  }
  let mejorValor = valores[0];
  let mejorConteo = 0;
  for (const [valor, conteo] of conteos) {
    if (conteo > mejorConteo) {
      mejorConteo = conteo;
      mejorValor = valor;
    }
  }
  return mejorValor;
}

/** Estado que se transporta entre columnas/páginas para dar continuidad a
 * encabezados institucionales y a entradas que no cerraron con una
 * referencia de publicación al final de una columna o página. */
export interface EstadoLecturaDocumento {
  institucionEnCurso: string | null;
  seccionEnCurso: string | null;
  fragmentoAbierto: string | null;
}

const ESTADO_INICIAL: EstadoLecturaDocumento = {
  institucionEnCurso: null,
  seccionEnCurso: null,
  fragmentoAbierto: null,
};

function construirEntradaDesdeParrafo(
  textoParrafo: string,
  estado: EstadoLecturaDocumento,
): EntradaParseada | null {
  const referencias = analizarReferencias(textoParrafo);
  if (referencias.length === 0) {
    return null;
  }

  const advertencias: string[] = [];
  const iniciaConGuion = textoParrafo.trimStart().startsWith('-');
  if (!iniciaConGuion) {
    advertencias.push('ENTRADA_SIN_VINETA');
  }

  const textoSinGuion = textoParrafo.replace(/^-\s*/, '');

  let institucion = estado.institucionEnCurso;
  let seccion = estado.seccionEnCurso;
  let cuerpoParaTitulo = textoSinGuion;

  const prefijo = extraerPrefijoInstitucion(
    textoSinGuion,
    estado.seccionEnCurso !== null,
  );
  if (prefijo !== null) {
    institucion = prefijo.institucion;
    cuerpoParaTitulo = textoSinGuion.slice(prefijo.textoCompleto.length);
  }
  if (institucion !== null && tieneGlueResidual(institucion)) {
    institucion = null;
  }
  if (institucion === null) {
    advertencias.push('INSTITUCION_NO_DETECTADA');
  }

  const primeraReferenciaEnTexto = [...referencias].sort(
    (a, b) => a.indice - b.indice,
  )[0];
  const {
    tipo,
    numero: numeroDetectado,
    titulo: tituloDetectado,
  } = detectarTipoNormaYTitulo(
    cuerpoParaTitulo,
    primeraReferenciaEnTexto.indice - (textoParrafo.length - cuerpoParaTitulo.length),
  );

  // Fail-closed: la continuidad geométrica de un párrafo (mismo párrafo,
  // misma fila) determina cuántos párrafos hay, nunca cuántas fichas
  // jurídicas describe. Ante evidencia genérica de que el párrafo mezcla
  // dos cláusulas jurídicas distintas, no se divide la entrada ni se
  // adivina qué identificador pertenece a cuál cláusula: se conserva una
  // sola entrada con numero/titulo en null.
  const posibleFusion = detectarPosibleFusionEntradas(cuerpoParaTitulo);
  if (posibleFusion) {
    advertencias.push('POSIBLE_FUSION_ENTRADAS');
  }
  const numero = posibleFusion ? null : numeroDetectado;
  const tituloSinFusion = posibleFusion ? null : tituloDetectado;

  // A diferencia de `institucion` (nombres propios en Title Case, donde una
  // transición de minúscula a mayúscula sin espacio nunca es legítima), un
  // título narrativo en minúscula-sentencia sí contiene mayúsculas internas
  // legítimas con frecuencia (siglas mixtas y unidades como "SARS-CoV-2",
  // "PDyOT", "kWh", nombres propios entre comillas como "HardCore..."): usar
  // `tieneGlueResidual` aquí produciría falsos positivos reales, ya
  // observados contra el fixture piloto. La única señal segura para título
  // es la racha de letras implausiblemente larga.
  const titulo =
    tituloSinFusion !== null && tieneRachaDeLetrasImplausible(tituloSinFusion)
      ? null
      : tituloSinFusion;
  if (tipo === null) advertencias.push('TIPO_NORMA_NO_DETECTADO');
  if (numero === null) advertencias.push('NUMERO_NORMA_NO_DETECTADO');
  if (titulo === null) advertencias.push('TITULO_NO_DETECTADO');

  const referenciasPorFecha = [...referencias].sort(compararReferenciasPorFecha);
  const referenciaPrincipal = referenciasPorFecha[0];
  const adicionales = referenciasPorFecha.slice(1);

  const publicacion = referenciaAPublicacion(referenciaPrincipal);
  if (publicacion.tipo === null) {
    advertencias.push('TIPO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO');
  }
  if (referencias.some((referencia) => referencia.fecha === null)) {
    advertencias.push('FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA');
  }
  if (!referenciaPrincipal.diaSemanaConsistente) {
    advertencias.push('DIA_SEMANA_INCONSISTENTE');
  }

  const metadataExtraccion: Record<string, unknown> = {};
  if (adicionales.length > 0) {
    metadataExtraccion.publicacionesAdicionales = adicionales.map(
      referenciaAPublicacion,
    );
    advertencias.push('MULTIPLES_PUBLICACIONES_DETECTADAS');
  }

  return {
    tipo,
    numero,
    titulo,
    institucion,
    seccion,
    publicacion,
    segmentoCrudo: textoParrafo,
    metadataExtraccion,
    advertencias,
    confianza: 1,
  };
}

function compararReferenciasPorFecha(
  a: ReferenciaEncontrada,
  b: ReferenciaEncontrada,
): number {
  if (a.fecha === null && b.fecha === null) return a.indice - b.indice;
  if (a.fecha === null) return 1;
  if (b.fecha === null) return -1;
  return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.indice - b.indice;
}

/** Resultado de parsear una única página, con el estado de encabezado y
 * de continuidad de párrafo al final de la página, para encadenar con la
 * siguiente. */
export interface ResultadoParseoPagina {
  entradas: EntradaParseada[];
  estadoFinal: EstadoLecturaDocumento;
}

/** Fracción superior/inferior de la página reservada a encabezado y pie de
 * página repetidos (título de la publicación, numeración de página), nunca
 * contenido legislativo. Proporcional al alto de página observado, no un
 * valor absoluto propio de este documento: se calibró contra la banda
 * donde ese encabezado/pie se repite de forma idéntica en decenas de
 * páginas del documento piloto, con margen amplio antes del cuerpo real. */
const MARGEN_SUPERIOR_FRACCION = 0.1;
const MARGEN_INFERIOR_FRACCION = 0.93;

function excluirEncabezadoYPie(
  palabras: PalabraPosicionada[],
  altoPagina: number,
): PalabraPosicionada[] {
  const limiteSuperior = altoPagina * MARGEN_SUPERIOR_FRACCION;
  const limiteInferior = altoPagina * MARGEN_INFERIOR_FRACCION;
  return palabras.filter(
    (p) => p.yDesdeArriba >= limiteSuperior && p.yDesdeArriba <= limiteInferior,
  );
}

export function parsearPagina(
  pagina: PaginaLeida,
  estadoInicial: EstadoLecturaDocumento = ESTADO_INICIAL,
): ResultadoParseoPagina {
  const palabrasDeContenido = excluirEncabezadoYPie(
    pagina.palabras,
    pagina.altoPagina,
  );
  const columnasDePalabras = detectarColumnasDePalabras(
    palabrasDeContenido,
    pagina.anchoPagina,
  );

  const entradas: EntradaParseada[] = [];
  let estado: EstadoLecturaDocumento = { ...estadoInicial };

  for (const palabrasColumna of columnasDePalabras) {
    const lineas = agruparEnLineas(palabrasColumna);
    const parrafos = segmentarParrafos(lineas);

    for (let i = 0; i < parrafos.length; i++) {
      let textoParrafo = parrafos[i].texto;
      let textoNormalizado = parrafos[i].textoNormalizado;
      if (estado.fragmentoAbierto !== null) {
        textoParrafo = `${estado.fragmentoAbierto} ${textoParrafo}`;
        textoNormalizado = `${estado.fragmentoAbierto} ${textoNormalizado}`;
        estado = { ...estado, fragmentoAbierto: null };
      }

      const entrada = construirEntradaDesdeParrafo(textoParrafo, estado);
      if (entrada !== null) {
        entradas.push(entrada);
        continue;
      }

      if (pareceEncabezadoSostenido(textoNormalizado)) {
        const textoEncabezado = textoNormalizado.replace(/:$/, '').trim();
        if (pareceEncabezadoSeccion(textoEncabezado)) {
          estado = {
            ...estado,
            seccionEnCurso: textoEncabezado,
            institucionEnCurso: null,
          };
        } else {
          estado = {
            ...estado,
            institucionEnCurso: textoEncabezado,
            seccionEnCurso: null,
          };
        }
        continue;
      }

      const esUltimoParrafoDeColumna = i === parrafos.length - 1;
      if (esUltimoParrafoDeColumna) {
        estado = { ...estado, fragmentoAbierto: textoParrafo };
      }
      // Un párrafo descriptivo o de agrupación que no es un encabezado
      // institucional verificable ni el último párrafo abierto de la
      // columna se ignora: no reemplaza la institución en curso ni se
      // convierte en una entrada.
    }
  }

  return { entradas, estadoFinal: estado };
}

export function parsearDocumento(
  paginas: PaginaLeida[],
): ResultadoParseoDocumento {
  const entradas: EntradaParseada[] = [];
  let estado: EstadoLecturaDocumento = ESTADO_INICIAL;

  for (const pagina of paginas) {
    const resultado = parsearPagina(pagina, estado);
    entradas.push(...resultado.entradas);
    estado = resultado.estadoFinal;
  }

  if (estado.fragmentoAbierto !== null) {
    const entradaFinal = construirEntradaDesdeParrafo(
      estado.fragmentoAbierto,
      estado,
    );
    if (entradaFinal !== null) {
      entradas.push(entradaFinal);
    }
  }

  return {
    periodoDetectado: detectarPeriodo(paginas),
    entradas,
  };
}

export function detectarPeriodo(
  paginas: PaginaLeida[],
): { anio: number; mes: number } | null {
  const conteos = new Map<string, number>();
  for (const pagina of paginas) {
    const columnasDePalabras = detectarColumnasDePalabras(
      pagina.palabras,
      pagina.anchoPagina,
    );
    const textoPagina = columnasDePalabras
      .map((palabrasColumna) =>
        agruparEnLineas(palabrasColumna)
          .map((l) => l.texto)
          .join(' '),
      )
      .join(' ');
    for (const referencia of analizarReferencias(textoPagina)) {
      if (referencia.fecha === null) continue;
      const [anio, mes] = referencia.fecha.split('-');
      const clave = `${anio}-${mes}`;
      conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
    }
  }

  if (conteos.size === 0) return null;

  let mejorClave = '';
  let mejorConteo = -1;
  for (const [clave, conteo] of conteos) {
    if (conteo > mejorConteo) {
      mejorConteo = conteo;
      mejorClave = clave;
    }
  }

  const [anio, mes] = mejorClave.split('-').map(Number);
  return { anio, mes };
}

import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

/**
 * Parseo del HTML de "cards" que devuelve el catálogo oficial del Registro
 * Oficial. Adaptado del mecanismo verificado en el proyecto de referencia: la
 * lógica de extracción (título, número, fecha, URL del PDF) y de clasificación
 * de la abreviatura es la misma, reexpresada como funciones puras sin estado ni
 * dependencias de framework.
 */

export type CardRegistroOficial = {
  numero: number;
  abreviatura: string;
  fechaPublicacion: Date | null;
  /**
   * true cuando la card traía texto de fecha pero era una fecha imposible o de
   * formato desconocido (no distinguible de "sin fecha" sin este indicador).
   * Una coincidencia con fecha inválida no permite una resolución confiable.
   */
  fechaInvalida: boolean;
  urlPdf: string;
};

/**
 * Card reconocida como entrada del catálogo (tiene título de card) pero sin
 * datos indispensables: no puede usarse como candidata y tampoco puede
 * descartarse en silencio, porque su sola presencia impide afirmar ausencia.
 * Conserva lo que sí pudo parsearse (número, abreviatura) para que el
 * adaptador decida si coincide con la consulta (fail-closed si no es
 * demostrable que pertenece a otra edición). Las razones de invalidez de URL
 * que requieren configuración (malformada, insegura, dominio no permitido) y
 * la fecha imposible se detectan en el adaptador sobre las cards válidas.
 */
export type CardNoConfiableRegistroOficial = {
  numero: number | null;
  abreviatura: string | null;
  razon: 'URL_AUSENTE' | 'DATOS_AMBIGUOS';
};

export type CardsExtraidasRegistroOficial = {
  validas: CardRegistroOficial[];
  noConfiables: CardNoConfiableRegistroOficial[];
};

const ORDEN_CLASIFICACION_ABREVIATURAS = [
  '7SRO',
  '6SRO',
  '5SRO',
  '4SRO',
  '3SRO',
  '2SRO',
  'SRO',
  'EE',
  'EC',
  'EJ',
  'RO',
] as const;

const LABELS_SUPLEMENTOS_ORDINALES = [
  'SEGUNDO SUPLEMENTO',
  'TERCER SUPLEMENTO',
  'CUARTO SUPLEMENTO',
  'QUINTO SUPLEMENTO',
  'SEXTO SUPLEMENTO',
  'SEPTIMO SUPLEMENTO',
];

const ETIQUETAS_TIPO_PUBLICACION: Record<
  string,
  { labels: string[]; excludedLabels: string[] }
> = {
  RO: { labels: ['REGISTRO OFICIAL'], excludedLabels: [] },
  SRO: {
    labels: [
      'SUPLEMENTO DEL REGISTRO OFICIAL',
      'SUPLEMENTO AL REGISTRO OFICIAL',
      'PRIMER SUPLEMENTO',
      'SUPLEMENTO',
    ],
    excludedLabels: LABELS_SUPLEMENTOS_ORDINALES,
  },
  '2SRO': { labels: ['SEGUNDO SUPLEMENTO'], excludedLabels: [] },
  '3SRO': { labels: ['TERCER SUPLEMENTO'], excludedLabels: [] },
  '4SRO': { labels: ['CUARTO SUPLEMENTO'], excludedLabels: [] },
  '5SRO': { labels: ['QUINTO SUPLEMENTO'], excludedLabels: [] },
  '6SRO': { labels: ['SEXTO SUPLEMENTO'], excludedLabels: [] },
  '7SRO': { labels: ['SEPTIMO SUPLEMENTO'], excludedLabels: [] },
  EE: { labels: ['EDICION ESPECIAL'], excludedLabels: [] },
  EC: {
    labels: ['EDICIONES CONSTITUCIONALES', 'EDICION CONSTITUCIONAL'],
    excludedLabels: [],
  },
  EJ: { labels: ['EDICION JURIDICA', 'EDICION JUDICIAL'], excludedLabels: [] },
};

const MESES_NORMALIZADOS: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

/** El sitio devuelve este marcador cuando la carpeta-mes no tiene archivos. */
export function esPaginaVaciaRegistroOficial(html: string): boolean {
  return html.length === 0 || html.includes('Sin Archivos post');
}

/**
 * Estructura reconocible de una página de listado del Registro Oficial: al
 * menos una card (`.card__title_post_imagen`). No basta con que el texto
 * contenga `<`: una página de mantenimiento o un HTML inesperado no cuenta como
 * respuesta válida y debe tratarse como no confiable (fail-closed).
 */
export function tieneEstructuraCardsRegistroOficial(html: string): boolean {
  return load(html)('.card__title_post_imagen').length > 0;
}

/** Números de página presentes en la respuesta (paginación del catálogo). */
export function extraerPaginasDisponibles(html: string): number[] {
  const $ = load(html);
  const paginas = new Set<number>();
  $('[data-page]').each((_, element) => {
    const value = Number($(element).attr('data-page'));
    if (Number.isInteger(value) && value > 0) {
      paginas.add(value);
    }
  });
  return [...paginas].sort((a, b) => a - b);
}

/**
 * Extrae las cards de una página del catálogo separando las válidas de las
 * reconocidas-pero-no-confiables. Ninguna card con título se descarta en
 * silencio: una card sin número/tipo reconocible o sin URL de PDF queda en
 * `noConfiables` con lo que sí pudo parsearse, para que el adaptador aplique
 * fail-closed cuando pueda coincidir con la consulta.
 */
export function extraerCardsRegistroOficial(
  html: string,
): CardsExtraidasRegistroOficial {
  const $ = load(html);
  const validas: CardRegistroOficial[] = [];
  const noConfiables: CardNoConfiableRegistroOficial[] = [];
  const vistas = new Set<string>();

  $('.card__title_post_imagen').each((_, titleNode) => {
    const tituloPrincipal = limpiarTexto($(titleNode).text());
    const contenedor = encontrarContenedorCard($, titleNode);

    // Primero identidad (número + tipo); la URL se evalúa después para no
    // perder la evidencia de una card coincidente con enlace ausente.
    const tituloNumero = limpiarTexto(
      contenedor.find('.card__title_numero_imagen').first().text(),
    );
    const textoCard = limpiarTexto(contenedor.text());
    const numero =
      extraerNumero(textoCard) ??
      extraerNumero(tituloNumero) ??
      extraerNumero(tituloPrincipal);
    const abreviatura = resolverAbreviatura(
      limpiarTexto([tituloPrincipal, textoCard].join(' ')),
    );
    if (numero === null || abreviatura === null) {
      noConfiables.push({ numero, abreviatura, razon: 'DATOS_AMBIGUOS' });
      return;
    }

    const urlPdf = limpiarTexto(
      contenedor.find('a.cta_post_imagen').first().attr('href'),
    );
    if (!urlPdf) {
      noConfiables.push({ numero, abreviatura, razon: 'URL_AUSENTE' });
      return;
    }

    const fechaTexto = extraerTextoFecha(contenedor);
    const fechaPublicacion = fechaTexto
      ? parsearFechaPublicacion(fechaTexto)
      : null;
    const card: CardRegistroOficial = {
      numero,
      abreviatura,
      fechaPublicacion,
      // Hubo texto de fecha pero no se pudo interpretar como fecha real.
      fechaInvalida: fechaTexto.length > 0 && fechaPublicacion === null,
      urlPdf,
    };

    const dedupeKey = `${card.abreviatura}:${card.numero}:${card.urlPdf}`;
    if (vistas.has(dedupeKey)) {
      return;
    }
    vistas.add(dedupeKey);
    validas.push(card);
  });

  return { validas, noConfiables };
}

/**
 * Busca el contenedor propio de la card (con enlace y fecha) subiendo por los
 * ancestros, sin cruzar hacia contenedores que abarcan otras cards: un
 * ancestro con más de un título de card mezclaría el número, la fecha o la
 * URL de una card vecina (p. ej. una card sin enlace "robaría" el PDF de
 * otra). Si no existe un contenedor propio completo, se devuelve el último
 * ancestro exclusivo de la card.
 */
function encontrarContenedorCard(
  $: CheerioAPI,
  titleNode: AnyNode,
): Cheerio<AnyNode> {
  let actual = $(titleNode).parent();
  let ultimoExclusivo = actual;
  while (actual.length > 0) {
    if (actual.find('.card__title_post_imagen').length > 1) {
      break;
    }
    ultimoExclusivo = actual;
    const tieneCta = actual.find('a.cta_post_imagen').length > 0;
    const tieneFecha = actual.find('.txt_fecha_post_imagen').length > 0;
    if (tieneCta && tieneFecha) {
      return actual;
    }
    actual = actual.parent();
  }
  return ultimoExclusivo;
}

function extraerTextoFecha(contenedor: Cheerio<AnyNode>): string {
  const textoCrudo = contenedor.find('.txt_fecha_post_imagen').first().text();
  const primeraLinea = textoCrudo
    .split('\n')
    .map((linea) => limpiarTexto(linea))[0];
  return limpiarTexto(primeraLinea);
}

function extraerNumero(texto: string): number | null {
  const match = normalizarTexto(texto).match(
    /\b(?:N|NO|NRO|NUMERO|NUM)\s*[°.º#:-]*\s*(\d+)\b/,
  );
  if (!match || !match[1]) {
    return null;
  }
  const numero = Number(match[1]);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function resolverAbreviatura(titulo: string): string | null {
  const tituloNormalizado = normalizarTexto(titulo);
  for (const abreviatura of ORDEN_CLASIFICACION_ABREVIATURAS) {
    const configuracion = ETIQUETAS_TIPO_PUBLICACION[abreviatura];
    if (!configuracion) {
      continue;
    }
    const coincideLabel = configuracion.labels.some((label) =>
      tituloNormalizado.includes(normalizarTexto(label)),
    );
    const coincideExcluido = configuracion.excludedLabels.some((label) =>
      tituloNormalizado.includes(normalizarTexto(label)),
    );
    if (coincideLabel && !coincideExcluido) {
      return abreviatura;
    }
  }
  return null;
}

function parsearFechaPublicacion(textoCrudo: string): Date | null {
  const normalizado = normalizarTexto(textoCrudo);
  const sinDiaSemana = normalizado.includes(',')
    ? limpiarTexto(normalizado.split(',').slice(-1)[0])
    : normalizado;

  const match = sinDiaSemana.match(
    /^(\d{1,2})\s+(?:DE\s+)?([A-Z]+)\s+(?:DE\s+)?(\d{4})$/,
  );
  if (!match || !match[1] || !match[2] || !match[3]) {
    return null;
  }

  const dia = Number(match[1]);
  const mes = MESES_NORMALIZADOS[match[2]];
  const anio = Number(match[3]);
  if (!mes || !Number.isInteger(dia) || !Number.isInteger(anio)) {
    return null;
  }
  // Round-trip: Date.UTC normaliza fechas imposibles (31 feb -> marzo). Se
  // rechaza cualquier fecha cuyo (año, mes, día) no coincida exactamente con la
  // entrada, para no fabricar una fecha real a partir de una imposible.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function limpiarTexto(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

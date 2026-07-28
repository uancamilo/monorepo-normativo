import {
  CatalogoRegistroOficial,
  ConsultaCatalogoRegistroOficial,
  EdicionCatalogoRegistroOficial,
  ResultadoConsultaCatalogoRegistroOficial,
} from '@normativo/aplicacion';
import { ubicarCarpetaRegistroOficial } from './registro-oficial-taxonomias';
import {
  CardNoConfiableRegistroOficial,
  CardRegistroOficial,
  esPaginaVaciaRegistroOficial,
  extraerCardsRegistroOficial,
  extraerPaginasDisponibles,
  tieneEstructuraCardsRegistroOficial,
} from './registro-oficial-html';
import {
  CacheCarpetaMes,
  ResultadoDescargaCarpeta,
} from './cache-carpeta-mes';

const RUTA_ADMIN_AJAX = '/wp-admin/admin-ajax.php';
const ACCION_LISTADO = 'get_term_post_kilur_con_imagen';
/** Tope duro de páginas por carpeta-mes (protección ante paginaciones enormes). */
const MAX_PAGINAS = 20;
/** Intentos totales por página (1 inicial + reintentos), acotado. */
const MAX_INTENTOS_POR_PAGINA = 3;
const BACKOFF_BASE_MS = 200;
/** Tope del backoff local; NO acota un `Retry-After` válido del servidor. */
const BACKOFF_MAX_MS = 2_000;
/** Vida útil de una descarga cacheada de carpeta-mes (corta, por diseño). */
const TTL_CACHE_CARPETA_MES_MS = 60_000;
/** Máximo de carpetas-mes retenidas en caché (sin crecimiento ilimitado). */
const MAX_ENTRADAS_CACHE = 64;
const STATUS_TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type ConfiguracionCatalogoRegistroOficialHttp = {
  /** Origen del sitio oficial (p. ej. https://www.registroficial.gob.ec). */
  baseUrl: string;
  /** Hosts permitidos para las URLs PDF devueltas (allowlist). */
  dominiosPdfPermitidos: string[];
  /**
   * Presupuesto total por búsqueda de carpeta-mes: conexión, espera de
   * headers, lectura completa de cada body, paginación, reintentos y esperas
   * de backoff comparten este plazo.
   */
  timeoutMs: number;
  maxBytesRespuesta: number;
  /** Vida útil de la caché de carpeta-mes; default corto. Inyectable en tests. */
  ttlCacheMs?: number;
  /** Máximo de entradas en caché. Inyectable en tests. */
  maxEntradasCache?: number;
  /**
   * Extensión operativa de años vía `CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA`
   * (ver `ubicarCarpetaRegistroOficial`). Nunca sobrescribe un año verificado.
   */
  aniosExtra?: Readonly<Record<number, number>>;
};

type FetchLike = typeof fetch;
type Esperar = (ms: number) => Promise<void>;
type Ahora = () => number;

type IntentoPagina =
  | { tipo: 'exito'; html: string }
  | { tipo: 'invalida' }
  | { tipo: 'transitorio'; retryAfterMs?: number };

/**
 * Resultado de leer el body bajo el presupuesto: `abortada` distingue el
 * vencimiento del plazo (fallo transitorio) de un cuerpo inválido, para no
 * convertir un timeout en RESPUESTA_CATALOGO_INVALIDA.
 */
type LecturaCuerpo =
  | { tipo: 'exito'; texto: string }
  | { tipo: 'invalida' }
  | { tipo: 'abortada' };

type ResultadoPagina =
  | { exitoso: true; html: string }
  | { exitoso: false; razon: ResultadoDescargaFallida['razon'] };

type ResultadoDescargaFallida = Extract<
  ResultadoDescargaCarpeta,
  { exitoso: false }
>;

/**
 * Adaptador HTTP real del catálogo oficial del Registro Oficial.
 *
 * Implementa el puerto puro de aplicación consultando el endpoint WordPress
 * `admin-ajax` de la carpeta-mes (tipo + año/mes derivados de la fecha oficial)
 * y filtrando por número. No conoce Prisma, no autoriza usuarios ni persiste.
 *
 * Semántica fail-closed: solo se concluye ausencia real (consulta exitosa sin
 * candidatas) cuando la taxonomía está cubierta, la respuesta tiene estructura
 * válida, la paginación se recorrió completa y ninguna card reconocida quedó
 * descartada por datos indispensables ausentes o no confiables (sin URL, sin
 * número o tipo interpretable, URL inválida, fecha imposible), salvo que sea
 * demostrable que pertenece a otra edición. Cualquier incertidumbre devuelve
 * una razón discriminada; la edición permanece PENDIENTE.
 *
 * Seguridad (SSRF y robustez):
 * - la URL base proviene solo de configuración, nunca del request HTTP;
 * - solo HTTPS (excepto localhost para pruebas locales);
 * - presupuesto total de tiempo (incluida la lectura completa de cada body),
 *   límite de tamaño de respuesta y de páginas;
 * - los redirects no se siguen a ciegas: un 3xx se trata como respuesta inválida;
 * - las URLs PDF se validan contra una allowlist de dominios y deben ser HTTPS;
 * - un fallo técnico devuelve una razón discriminada, jamás una URL fabricada.
 *
 * Eficiencia (sin amplificar solicitudes): las descargas de la misma
 * carpeta-mes se deduplican y cachean localmente durante un TTL corto, de modo
 * que resolver muchas ediciones del mismo mes no repite la paginación completa.
 */
export class CatalogoRegistroOficialHttp implements CatalogoRegistroOficial {
  private readonly baseUrl: URL;
  private readonly dominiosPdfPermitidos: Set<string>;
  private readonly timeoutMs: number;
  private readonly maxBytesRespuesta: number;
  private readonly fetchImpl: FetchLike;
  private readonly esperar: Esperar;
  private readonly ahora: Ahora;
  private readonly cache: CacheCarpetaMes;
  private readonly aniosExtra: Readonly<Record<number, number>>;

  constructor(
    configuracion: ConfiguracionCatalogoRegistroOficialHttp,
    fetchImpl: FetchLike = fetch,
    opciones: { esperar?: Esperar; ahora?: Ahora } = {},
  ) {
    this.baseUrl = new URL(configuracion.baseUrl);
    this.dominiosPdfPermitidos = new Set(
      configuracion.dominiosPdfPermitidos.map((host) => host.toLowerCase()),
    );
    this.timeoutMs = configuracion.timeoutMs;
    this.maxBytesRespuesta = configuracion.maxBytesRespuesta;
    this.aniosExtra = configuracion.aniosExtra ?? {};
    this.fetchImpl = fetchImpl;
    this.ahora = opciones.ahora ?? Date.now;
    this.esperar =
      opciones.esperar ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.cache = new CacheCarpetaMes(
      configuracion.ttlCacheMs ?? TTL_CACHE_CARPETA_MES_MS,
      configuracion.maxEntradasCache ?? MAX_ENTRADAS_CACHE,
      this.ahora,
    );
  }

  async buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<ResultadoConsultaCatalogoRegistroOficial> {
    const fecha = consulta.fechaPublicacionOficial;
    const ubicacion = ubicarCarpetaRegistroOficial(
      consulta.tipoPublicacionRegistroOficial,
      fecha.getUTCFullYear(),
      fecha.getUTCMonth() + 1,
      this.aniosExtra,
    );
    // Taxonomía no cubierta NO implica que la edición no exista: es
    // incertidumbre, no ausencia. La edición permanece PENDIENTE.
    if (ubicacion === null) {
      return { exitoso: false, razon: 'COBERTURA_CATALOGO_NO_DISPONIBLE' };
    }

    const clave = `${ubicacion.idCarpeta}:${ubicacion.yearId}:${ubicacion.mesId}`;
    const descarga = await this.cache.obtener(clave, () =>
      this.descargarCarpetaMes(ubicacion),
    );
    if (!descarga.exitoso) {
      return descarga;
    }

    return this.construirResultado(
      consulta,
      descarga.cards,
      descarga.cardsNoConfiables,
    );
  }

  /**
   * Recorre la carpeta-mes completa bajo un presupuesto total de tiempo
   * (compartido por todas las páginas y reintentos). Devuelve las cards crudas
   * o una razón tipada. Nunca devuelve datos parciales como éxito.
   */
  private async descargarCarpetaMes(ubicacion: {
    idCarpeta: number;
    yearId: number;
    mesId: number;
    nombreMes: string;
  }): Promise<ResultadoDescargaCarpeta> {
    const limite = this.ahora() + this.timeoutMs;
    const cards: CardRegistroOficial[] = [];
    const cardsNoConfiables: CardNoConfiableRegistroOficial[] = [];
    const visitadas = new Set<number>();
    let page = 1;

    for (;;) {
      if (visitadas.has(page)) {
        break;
      }
      visitadas.add(page);

      const respuesta = await this.obtenerPaginaConReintentos(
        ubicacion,
        page,
        limite,
      );
      if (!respuesta.exitoso) {
        return { exitoso: false, razon: respuesta.razon };
      }
      const html = respuesta.html;

      if (esPaginaVaciaRegistroOficial(html)) {
        break;
      }
      // Fail-closed: sin estructura reconocible de cards ni marcador de vacío,
      // la respuesta no es confiable (mantenimiento, HTML inesperado).
      if (!tieneEstructuraCardsRegistroOficial(html)) {
        return { exitoso: false, razon: 'RESPUESTA_CATALOGO_INVALIDA' };
      }

      const extraidas = extraerCardsRegistroOficial(html);
      cards.push(...extraidas.validas);
      cardsNoConfiables.push(...extraidas.noConfiables);

      const paginas = extraerPaginasDisponibles(html);
      const siguiente = paginas.find(
        (candidata) => candidata > page && !visitadas.has(candidata),
      );
      if (siguiente === undefined) {
        break;
      }
      // Hay más páginas anunciadas pero se alcanzó el tope: la búsqueda queda
      // incompleta. No se concluye ausencia ni se usan candidatas parciales.
      if (visitadas.size >= MAX_PAGINAS) {
        return { exitoso: false, razon: 'BUSQUEDA_CATALOGO_INCOMPLETA' };
      }
      page = siguiente;
    }

    return { exitoso: true, cards, cardsNoConfiables };
  }

  private construirResultado(
    consulta: ConsultaCatalogoRegistroOficial,
    cards: CardRegistroOficial[],
    cardsNoConfiables: CardNoConfiableRegistroOficial[],
  ): ResultadoConsultaCatalogoRegistroOficial {
    // Una card reconocida pero no confiable (sin URL, sin número o sin tipo
    // interpretable) solo puede ignorarse si es demostrable que pertenece a
    // otra edición. Si coincide o no puede descartarse la coincidencia, la
    // respuesta no permite afirmar ausencia: fail-closed.
    for (const card of cardsNoConfiables) {
      const numeroDescartable =
        card.numero !== null &&
        card.numero !== consulta.numeroPublicacionRegistroOficial;
      const tipoDescartable =
        card.abreviatura !== null &&
        card.abreviatura !== consulta.tipoPublicacionRegistroOficial;
      if (!numeroDescartable && !tipoDescartable) {
        return { exitoso: false, razon: 'RESPUESTA_CATALOGO_INVALIDA' };
      }
    }

    const candidatas: EdicionCatalogoRegistroOficial[] = [];
    const urlsVistas = new Set<string>();

    for (const card of cards) {
      if (
        card.abreviatura !== consulta.tipoPublicacionRegistroOficial ||
        card.numero !== consulta.numeroPublicacionRegistroOficial
      ) {
        continue;
      }
      // Una card COINCIDENTE con datos no confiables no puede descartarse
      // silenciosamente para concluir "sin resultados": es respuesta inválida.
      if (card.fechaInvalida) {
        return { exitoso: false, razon: 'RESPUESTA_CATALOGO_INVALIDA' };
      }
      if (!this.esUrlPdfPermitida(card.urlPdf)) {
        return { exitoso: false, razon: 'RESPUESTA_CATALOGO_INVALIDA' };
      }
      // Deduplica únicamente URLs idénticas.
      if (urlsVistas.has(card.urlPdf)) {
        continue;
      }
      urlsVistas.add(card.urlPdf);
      candidatas.push({
        urlPdf: card.urlPdf,
        fechaPublicacionOficial: card.fechaPublicacion,
      });
    }

    return { exitoso: true, candidatas };
  }

  /**
   * Obtiene una página con reintentos acotados ante fallos transitorios,
   * respetando el presupuesto total (`limite`, época ms) y `Retry-After`.
   */
  private async obtenerPaginaConReintentos(
    ubicacion: { idCarpeta: number; yearId: number; mesId: number; nombreMes: string },
    page: number,
    limite: number,
  ): Promise<ResultadoPagina> {
    for (let intento = 1; ; intento += 1) {
      const restante = limite - this.ahora();
      if (restante <= 0) {
        return { exitoso: false, razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' };
      }

      const intentoPagina = await this.obtenerPaginaUnaVez(
        ubicacion,
        page,
        restante,
      );
      if (intentoPagina.tipo === 'exito') {
        return { exitoso: true, html: intentoPagina.html };
      }
      if (intentoPagina.tipo === 'invalida') {
        return { exitoso: false, razon: 'RESPUESTA_CATALOGO_INVALIDA' };
      }

      // Transitorio: reintentar solo si quedan intentos y presupuesto.
      if (intento >= MAX_INTENTOS_POR_PAGINA) {
        return { exitoso: false, razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' };
      }
      // Un Retry-After válido se respeta completo (semántica HTTP): jamás se
      // recorta al backoff máximo local. Uno en el pasado equivale a espera 0
      // (reintento inmediato, determinista). El backoff local acotado aplica
      // solo cuando no hay Retry-After válido.
      const espera =
        intentoPagina.retryAfterMs !== undefined
          ? intentoPagina.retryAfterMs
          : calcularBackoffLocal(intento);
      // Si la espera no cabe en el presupuesto restante no se espera
      // parcialmente ni se reintenta: fallo transitorio y edición PENDIENTE.
      if (limite - this.ahora() - espera <= 0) {
        return { exitoso: false, razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' };
      }
      await this.esperar(espera);
    }
  }

  private async obtenerPaginaUnaVez(
    ubicacion: { idCarpeta: number; yearId: number; mesId: number; nombreMes: string },
    page: number,
    msRestante: number,
  ): Promise<IntentoPagina> {
    const url = new URL(RUTA_ADMIN_AJAX, this.baseUrl);
    const cuerpo = new URLSearchParams({
      action: ACCION_LISTADO,
      year_id: String(ubicacion.yearId),
      mes_id: String(ubicacion.mesId),
      name_folder: ubicacion.nombreMes,
      page: String(page),
      id_carpeta: String(ubicacion.idCarpeta),
    });

    // El temporizador de abort permanece activo hasta terminar de leer (o
    // cancelar) el body: `msRestante` cubre conexión, headers y lectura
    // completa, no solo la espera de headers.
    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      Math.max(1, msRestante),
    );
    try {
      let respuesta: Response;
      try {
        respuesta = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'text/html, application/json',
          },
          body: cuerpo.toString(),
          redirect: 'manual',
          signal: controlador.signal,
        });
      } catch {
        // Red, DNS, timeout/abort: transitorio.
        return { tipo: 'transitorio' };
      }

      if (STATUS_TRANSITORIOS.has(respuesta.status)) {
        void respuesta.body?.cancel().catch(() => undefined);
        return {
          tipo: 'transitorio',
          retryAfterMs: interpretarRetryAfter(
            respuesta.headers.get('retry-after'),
            this.ahora(),
          ),
        };
      }
      // Cualquier otro no-2xx (incluye 3xx: no se siguen redirects a ciegas).
      if (respuesta.status < 200 || respuesta.status >= 300) {
        void respuesta.body?.cancel().catch(() => undefined);
        return { tipo: 'invalida' };
      }

      const lectura = await this.leerCuerpoAcotado(
        respuesta,
        controlador.signal,
      );
      if (lectura.tipo === 'abortada') {
        // Venció el presupuesto leyendo el body: transitorio, nunca
        // respuesta inválida ni (aguas arriba) NO_ENCONTRADA.
        return { tipo: 'transitorio' };
      }
      if (lectura.tipo === 'invalida') {
        return { tipo: 'invalida' };
      }

      const html = extraerHtmlDeRespuesta(lectura.texto);
      if (html === null) {
        return { tipo: 'invalida' };
      }
      return { tipo: 'exito', html };
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Lee el cuerpo respetando el tope de bytes y el presupuesto restante: cada
   * lectura compite contra la señal de abort, de modo que un body detenido se
   * cancela al vencer el plazo aunque el stream subyacente no honre la señal.
   * No deja lecturas pendientes: al abortar o exceder el tope, el lector se
   * cancela y se libera.
   */
  private async leerCuerpoAcotado(
    respuesta: Response,
    senal: AbortSignal,
  ): Promise<LecturaCuerpo> {
    const declarado = Number(respuesta.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > this.maxBytesRespuesta) {
      void respuesta.body?.cancel().catch(() => undefined);
      return { tipo: 'invalida' };
    }

    const cuerpo = respuesta.body;
    if (cuerpo === null) {
      try {
        const texto = await respuesta.text();
        return texto.length <= this.maxBytesRespuesta
          ? { tipo: 'exito', texto }
          : { tipo: 'invalida' };
      } catch {
        return senal.aborted ? { tipo: 'abortada' } : { tipo: 'invalida' };
      }
    }

    const lector = cuerpo.getReader();
    const abortada = new Promise<{ tipo: 'abortada' }>((resolve) => {
      if (senal.aborted) {
        resolve({ tipo: 'abortada' });
        return;
      }
      senal.addEventListener('abort', () => resolve({ tipo: 'abortada' }), {
        once: true,
      });
    });

    const partes: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const lecturaChunk = lector
          .read()
          .then((r) => ({ tipo: 'chunk' as const, ...r }));
        const paso = await Promise.race([lecturaChunk, abortada]);
        if (paso.tipo === 'abortada') {
          // La lectura pendiente se asienta con la cancelación; el catch
          // evita un unhandled rejection si el stream termina en error.
          void lecturaChunk.catch(() => undefined);
          await cancelarLector(lector);
          return { tipo: 'abortada' };
        }
        if (paso.done) {
          break;
        }
        if (paso.value) {
          total += paso.value.byteLength;
          if (total > this.maxBytesRespuesta) {
            await cancelarLector(lector);
            return { tipo: 'invalida' };
          }
          partes.push(paso.value);
        }
      }
    } catch {
      await cancelarLector(lector);
      return senal.aborted ? { tipo: 'abortada' } : { tipo: 'invalida' };
    }

    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const parte of partes) {
      buffer.set(parte, offset);
      offset += parte.byteLength;
    }
    return { tipo: 'exito', texto: new TextDecoder('utf-8').decode(buffer) };
  }

  private esUrlPdfPermitida(urlPdf: string): boolean {
    let url: URL;
    try {
      url = new URL(urlPdf);
    } catch {
      return false;
    }
    if (!esOrigenSeguro(url)) {
      return false;
    }
    return this.dominiosPdfPermitidos.has(url.host.toLowerCase());
  }
}

/** Cancela y libera el lector sin propagar errores de un stream ya errado. */
async function cancelarLector(
  lector: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await lector.cancel();
  } catch {
    // El stream ya estaba errado o cerrado: no hay nada que liberar.
  }
}

/** HTTPS salvo host local (para pruebas con servidor HTTP controlado). */
export function esOrigenSeguro(url: URL): boolean {
  if (url.protocol === 'https:') {
    return true;
  }
  if (url.protocol === 'http:') {
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  }
  return false;
}

/** Backoff exponencial local, acotado por BACKOFF_MAX_MS (sin Retry-After). */
function calcularBackoffLocal(intento: number): number {
  const exponencial = BACKOFF_BASE_MS * 2 ** (intento - 1);
  return Math.min(exponencial, BACKOFF_MAX_MS);
}

/**
 * Interpreta `Retry-After` (segundos o fecha HTTP); undefined si no es
 * válido. Una fecha ya pasada devuelve 0 (reintento inmediato).
 */
function interpretarRetryAfter(
  valor: string | null,
  ahoraMs: number,
): number | undefined {
  if (valor === null) {
    return undefined;
  }
  const recortado = valor.trim();
  if (/^\d+$/.test(recortado)) {
    return Number(recortado) * 1000;
  }
  const fecha = Date.parse(recortado);
  if (Number.isNaN(fecha)) {
    return undefined;
  }
  const delta = fecha - ahoraMs;
  return delta > 0 ? delta : 0;
}

/**
 * El endpoint responde JSON `{success, data: "<html>"}` o HTML crudo. Devuelve
 * el HTML o null si el cuerpo no es interpretable (p. ej. JSON sin `data`).
 */
function extraerHtmlDeRespuesta(cuerpo: string): string | null {
  const recortado = cuerpo.trim();
  if (recortado.length === 0) {
    return null;
  }
  if (recortado.startsWith('{') || recortado.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(recortado);
    } catch {
      return null;
    }
    if (
      typeof json === 'object' &&
      json !== null &&
      'data' in json &&
      typeof (json as { data: unknown }).data === 'string'
    ) {
      return (json as { data: string }).data;
    }
    return null;
  }
  return cuerpo;
}

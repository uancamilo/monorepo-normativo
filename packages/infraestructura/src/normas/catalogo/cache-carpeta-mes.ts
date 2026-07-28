import { RazonConsultaCatalogoFallida } from '@normativo/aplicacion';
import {
  CardNoConfiableRegistroOficial,
  CardRegistroOficial,
} from './registro-oficial-html';

/**
 * Resultado de descargar (con paginación completa) una carpeta-mes del
 * catálogo: las cards crudas (válidas y reconocidas-pero-no-confiables) o una
 * razón de fallo tipada. El filtrado por número se hace después, para que
 * distintas ediciones del mismo mes reutilicen la misma descarga; las cards no
 * confiables se conservan porque su coincidencia con una consulta impide
 * concluir ausencia (fail-closed).
 */
export type ResultadoDescargaCarpeta =
  | {
      exitoso: true;
      cards: CardRegistroOficial[];
      cardsNoConfiables: CardNoConfiableRegistroOficial[];
    }
  | { exitoso: false; razon: RazonConsultaCatalogoFallida };

/** Marca de entrada en vuelo: comparte la Promise entre solicitudes concurrentes. */
const EN_VUELO = Number.POSITIVE_INFINITY;

type EntradaCache = {
  promesa: Promise<ResultadoDescargaCarpeta>;
  /** Época (ms) de expiración; EN_VUELO mientras la descarga no ha terminado. */
  expiraEn: number;
};

/**
 * Caché/deduplicación local del adaptador, acotada por carpeta-año-mes.
 *
 * - deduplica descargas concurrentes de la misma carpeta-mes (comparten Promise);
 * - reutiliza una descarga exitosa durante un TTL corto;
 * - NO cachea fallos (transitorios o no): un fallo se descarta y se puede
 *   reintentar de inmediato;
 * - acota el número de entradas (evicción por antigüedad), sin crecimiento
 *   ilimitado; sin Redis ni persistencia.
 *
 * Seguro ante concurrencia por el modelo de un solo hilo de Node: la Promise en
 * vuelo se registra de forma síncrona antes de esperar.
 */
export class CacheCarpetaMes {
  private readonly entradas = new Map<string, EntradaCache>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntradas: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  async obtener(
    clave: string,
    descargar: () => Promise<ResultadoDescargaCarpeta>,
  ): Promise<ResultadoDescargaCarpeta> {
    const existente = this.entradas.get(clave);
    if (existente !== undefined && this.estaVigente(existente)) {
      return existente.promesa;
    }
    if (existente !== undefined) {
      this.entradas.delete(clave);
    }

    const promesa = descargar();
    const entrada: EntradaCache = { promesa, expiraEn: EN_VUELO };
    this.podar();
    this.entradas.set(clave, entrada);

    void promesa.then(
      (resultado) => this.asentar(clave, entrada, resultado.exitoso),
      () => this.asentar(clave, entrada, false),
    );

    return promesa;
  }

  /** Número de entradas retenidas (solo para pruebas/observabilidad). */
  get tamano(): number {
    return this.entradas.size;
  }

  private estaVigente(entrada: EntradaCache): boolean {
    return entrada.expiraEn === EN_VUELO || entrada.expiraEn > this.ahora();
  }

  private asentar(clave: string, entrada: EntradaCache, exitoso: boolean): void {
    // Solo actúa si la entrada sigue siendo la registrada por esta descarga.
    if (this.entradas.get(clave) !== entrada) {
      return;
    }
    if (exitoso) {
      entrada.expiraEn = this.ahora() + this.ttlMs;
    } else {
      // Los fallos no se cachean: la próxima consulta reintenta.
      this.entradas.delete(clave);
    }
  }

  /** Evicta entradas expiradas y, si aún se supera el máximo, las más antiguas. */
  private podar(): void {
    const ahora = this.ahora();
    for (const [clave, entrada] of this.entradas) {
      if (entrada.expiraEn !== EN_VUELO && entrada.expiraEn <= ahora) {
        this.entradas.delete(clave);
      }
    }
    while (this.entradas.size >= this.maxEntradas) {
      const primera = this.entradas.keys().next().value;
      if (primera === undefined) {
        break;
      }
      this.entradas.delete(primera);
    }
  }
}

import { createHash } from 'node:crypto';
import type { DescargadorPdfIndiceRegistroOficial } from '@normativo/aplicacion';
import type { ResultadoDescargaPdfIndice } from '@normativo/aplicacion';
import { LIMITE_TAMANIO_BYTES } from '../extractor-registro-oficial/adaptador-pdfjs';
import { esUrlIndicePermitida } from './validar-url-indice';

export type ConfiguracionDescargadorPdfIndice = {
  /** Presupuesto total: conexión, headers y lectura completa del cuerpo. */
  timeoutMs: number;
};

type FetchLike = typeof fetch;

type LecturaCuerpo =
  | { tipo: 'exito'; bytes: Uint8Array }
  | { tipo: 'invalida' }
  | { tipo: 'demasiado_grande' }
  | { tipo: 'abortada' };

/**
 * Adaptador HTTP de descarga acotada del PDF del índice mensual (Fase 5D).
 * No reutiliza `CatalogoRegistroOficialHttp` (Fase 5B): ese adaptador
 * decodifica su cuerpo como texto UTF-8 (consume HTML admin-ajax) y su
 * `esOrigenSeguro` acepta `http:` en `localhost` para su propio servidor de
 * pruebas — ninguna de las dos cosas es apropiada para bytes binarios de un
 * PDF ni para una URL que introduce un `SUPERADMINISTRADOR` real. El patrón
 * de streaming acotado (`AbortController`+timeout total, carrera lectura-vs-
 * abort, cancelación real del lector, pre-chequeo de Content-Length + conteo
 * real de bytes) sí se reutiliza como diseño, reimplementado aquí para
 * acumular bytes crudos en vez de decodificar texto.
 */
export class DescargadorPdfIndiceRegistroOficialHttp
  implements DescargadorPdfIndiceRegistroOficial
{
  constructor(
    private readonly configuracion: ConfiguracionDescargadorPdfIndice,
    private readonly fetchImpl: FetchLike = fetch,
    /**
     * Límite de bytes, inyectable solo para permitir pruebas rápidas sin
     * asignar buffers de 50MB reales. La producción nunca lo sobreescribe:
     * el default es exactamente `LIMITE_TAMANIO_BYTES` de Fase 5C, nunca un
     * segundo número declarado por separado.
     */
    private readonly limiteBytes: number = LIMITE_TAMANIO_BYTES,
  ) {}

  async descargar(urlPdf: string): Promise<ResultadoDescargaPdfIndice> {
    if (!esUrlIndicePermitida(urlPdf)) {
      return { exitoso: false, razon: 'URL_PDF_INDICE_NO_PERMITIDA' };
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      Math.max(1, this.configuracion.timeoutMs),
    );
    try {
      let respuesta: Response;
      try {
        respuesta = await this.fetchImpl(urlPdf, {
          method: 'GET',
          redirect: 'manual',
          signal: controlador.signal,
        });
      } catch {
        // Red, DNS, timeout/abort antes de recibir cabeceras: transitorio.
        return {
          exitoso: false,
          razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
        };
      }

      // Cualquier no-2xx (incluidos todos los 3xx: nunca se sigue un
      // redirect a ciegas) es rechazo; 5xx se trata como transitorio, el
      // resto (incluidos 3xx y 4xx) como definitivo.
      if (respuesta.status < 200 || respuesta.status >= 300) {
        void respuesta.body?.cancel().catch(() => undefined);
        return {
          exitoso: false,
          razon:
            respuesta.status >= 500
              ? 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE'
              : 'DESCARGA_INDICE_INVALIDA',
        };
      }

      // No se confía en la extensión de la URL ni se exige un Content-Type
      // concreto. Content-Type solo habilita un rechazo temprano cuando
      // declara texto explícitamente incompatible (HTML/texto plano);
      // ausente o application/octet-stream se acepta aquí. Para lo que este
      // filtro admite, la cabecera `%PDF-` y PDF.js (más adelante, fuera de
      // este adaptador) hacen la validación definitiva del PDF.
      const contentType = respuesta.headers.get('content-type');
      if (contentType !== null && /^text\//i.test(contentType.trim())) {
        void respuesta.body?.cancel().catch(() => undefined);
        return { exitoso: false, razon: 'DESCARGA_INDICE_INVALIDA' };
      }

      const lectura = await this.leerCuerpoAcotado(
        respuesta,
        controlador.signal,
      );
      if (lectura.tipo === 'abortada') {
        return {
          exitoso: false,
          razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
        };
      }
      if (lectura.tipo === 'demasiado_grande') {
        return { exitoso: false, razon: 'PDF_INDICE_DEMASIADO_GRANDE' };
      }
      if (lectura.tipo === 'invalida') {
        return { exitoso: false, razon: 'DESCARGA_INDICE_INVALIDA' };
      }

      const sha256Pdf = createHash('sha256')
        .update(lectura.bytes)
        .digest('hex');
      return {
        exitoso: true,
        bytes: lectura.bytes,
        tamanioBytes: lectura.bytes.byteLength,
        sha256Pdf,
      };
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Lee el cuerpo respetando el tope de bytes y el presupuesto restante,
   * acumulando bytes binarios crudos (nunca decodificados como texto). Cada
   * lectura compite contra la señal de abort; al abortar o exceder el tope,
   * el lector se cancela y se libera, sin dejar streams pendientes.
   */
  private async leerCuerpoAcotado(
    respuesta: Response,
    senal: AbortSignal,
  ): Promise<LecturaCuerpo> {
    const declarado = Number(respuesta.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > this.limiteBytes) {
      void respuesta.body?.cancel().catch(() => undefined);
      return { tipo: 'demasiado_grande' };
    }

    const cuerpo = respuesta.body;
    if (cuerpo === null) {
      try {
        const buffer = new Uint8Array(await respuesta.arrayBuffer());
        return buffer.byteLength > this.limiteBytes
          ? { tipo: 'demasiado_grande' }
          : { tipo: 'exito', bytes: buffer };
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
          void lecturaChunk.catch(() => undefined);
          await cancelarLector(lector);
          return { tipo: 'abortada' };
        }
        if (paso.done) {
          break;
        }
        if (paso.value) {
          total += paso.value.byteLength;
          if (total > this.limiteBytes) {
            await cancelarLector(lector);
            return { tipo: 'demasiado_grande' };
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
    return { tipo: 'exito', bytes: buffer };
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

import { describe, expect, it } from '@jest/globals';
import { createHash } from 'crypto';
import { DescargadorPdfIndiceRegistroOficialHttp } from '../descargador-pdf-indice-http';
import { LIMITE_TAMANIO_BYTES } from '../../extractor-registro-oficial/adaptador-pdfjs';
import { HOSTNAME_PDF_INDICE_OFICIAL } from '../validar-url-indice';

const URL_VALIDA = `https://${HOSTNAME_PDF_INDICE_OFICIAL}/storage/x?token=abc`;

function respuestaBytes(
  bytes: Uint8Array,
  opciones: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(bytes, {
    status: opciones.status ?? 200,
    headers: opciones.headers,
  });
}

function fetchQueDevuelve(respuesta: Response): typeof fetch {
  return (async () => respuesta) as unknown as typeof fetch;
}

function fetchQueRechaza(error: unknown): typeof fetch {
  return (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

describe('DescargadorPdfIndiceRegistroOficialHttp', () => {
  it('el constructor por defecto usa LIMITE_TAMANIO_BYTES de Fase 5C (misma constante, sin duplicar el número)', () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetch,
    );
    expect(
      (descargador as unknown as { limiteBytes: number }).limiteBytes,
    ).toBe(LIMITE_TAMANIO_BYTES);
  });

  it('rechaza una URL no permitida sin invocar fetch (delegado a esUrlIndicePermitida)', async () => {
    let invocado = false;
    const fetchImpl = (async () => {
      invocado = true;
      return respuestaBytes(new Uint8Array([1]));
    }) as unknown as typeof fetch;
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchImpl,
    );

    const resultado = await descargador.descargar('http://evil.com/x');

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'URL_PDF_INDICE_NO_PERMITIDA',
    });
    expect(invocado).toBe(false);
  });

  it('descarga con éxito: bytes, tamaño y sha256 correctos sobre el contenido completo', async () => {
    const contenido = Buffer.from('contenido-pdf-de-prueba');
    const shaEsperado = createHash('sha256').update(contenido).digest('hex');
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(new Uint8Array(contenido), {
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
    );

    const resultado = await descargador.descargar(URL_VALIDA);

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(Buffer.from(resultado.bytes).toString()).toBe(
        contenido.toString(),
      );
      expect(resultado.tamanioBytes).toBe(contenido.byteLength);
      expect(resultado.sha256Pdf).toBe(shaEsperado);
    }
  });

  it('acepta Content-Type application/octet-stream (confía finalmente en los bytes/PDF.js)', async () => {
    const contenido = new Uint8Array(Buffer.from('%PDF-1.4'));
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(contenido, {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      ),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado.exitoso).toBe(true);
  });

  it('acepta Content-Type ausente', async () => {
    const contenido = new Uint8Array(Buffer.from('%PDF-1.4'));
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(respuestaBytes(contenido)),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado.exitoso).toBe(true);
  });

  it('rechaza Content-Type text/html explícito', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(new Uint8Array(Buffer.from('<html></html>')), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_INVALIDA',
    });
  });

  it('rechaza Content-Type text/plain explícito', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(new Uint8Array(Buffer.from('no soy un pdf')), {
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_INVALIDA',
    });
  });

  it('nunca sigue un redirect (3xx tratado como inválido)', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(new Uint8Array(0), {
          status: 302,
          headers: { location: 'https://otro-host.example/x' },
        }),
      ),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_INVALIDA',
    });
  });

  it('4xx remoto -> DESCARGA_INDICE_INVALIDA', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(respuestaBytes(new Uint8Array(0), { status: 404 })),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_INVALIDA',
    });
  });

  it('5xx remoto -> DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(respuestaBytes(new Uint8Array(0), { status: 503 })),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
    });
  });

  it('error de red (fetch rechaza) -> DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueRechaza(new Error('ENOTFOUND')),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
    });
  });

  it('Content-Length superior al límite -> PDF_INDICE_DEMASIADO_GRANDE (rechazo previo, sin leer el cuerpo)', async () => {
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchQueDevuelve(
        respuestaBytes(new Uint8Array(1), {
          headers: { 'content-length': String(LIMITE_TAMANIO_BYTES + 1) },
        }),
      ),
    );
    const resultado = await descargador.descargar(URL_VALIDA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_DEMASIADO_GRANDE',
    });
  });

  describe('con un límite pequeño inyectado (evita asignar buffers de 50MB en los tests)', () => {
    const LIMITE_TEST = 500;

    it('exactamente el límite se acepta', async () => {
      const bytes = new Uint8Array(LIMITE_TEST);
      const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
        { timeoutMs: 1000 },
        fetchQueDevuelve(respuestaBytes(bytes)),
        LIMITE_TEST,
      );
      const resultado = await descargador.descargar(URL_VALIDA);
      expect(resultado.exitoso).toBe(true);
      if (resultado.exitoso) {
        expect(resultado.tamanioBytes).toBe(LIMITE_TEST);
      }
    });

    it('un byte por encima del límite se rechaza, sin Content-Length (conteo real durante streaming)', async () => {
      const bytes = new Uint8Array(LIMITE_TEST + 1);
      const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
        { timeoutMs: 1000 },
        fetchQueDevuelve(respuestaBytes(bytes)),
        LIMITE_TEST,
      );
      const resultado = await descargador.descargar(URL_VALIDA);
      expect(resultado).toEqual({
        exitoso: false,
        razon: 'PDF_INDICE_DEMASIADO_GRANDE',
      });
    });

    it('Content-Length ausente/falso (menor al real): el conteo real de bytes durante el streaming manda, no el header', async () => {
      const bytes = new Uint8Array(LIMITE_TEST + 50);
      const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
        { timeoutMs: 1000 },
        fetchQueDevuelve(
          respuestaBytes(bytes, { headers: { 'content-length': '1' } }),
        ),
        LIMITE_TEST,
      );
      const resultado = await descargador.descargar(URL_VALIDA);
      expect(resultado).toEqual({
        exitoso: false,
        razon: 'PDF_INDICE_DEMASIADO_GRANDE',
      });
    });
  });

  it('entrega method GET, redirect manual y una AbortSignal real a fetch (caracterización directa de RequestInit)', async () => {
    let capturado: RequestInit | undefined;
    const fetchImpl = (async (
      _url: unknown,
      init?: RequestInit,
    ): Promise<Response> => {
      capturado = init;
      return respuestaBytes(new Uint8Array(Buffer.from('%PDF-1.4')));
    }) as unknown as typeof fetch;

    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 1000 },
      fetchImpl,
    );
    const resultado = await descargador.descargar(URL_VALIDA);

    expect(resultado.exitoso).toBe(true);
    expect(capturado?.method).toBe('GET');
    expect(capturado?.redirect).toBe('manual');
    expect(capturado?.signal).toBeInstanceOf(AbortSignal);
  });

  it('timeout antes de recibir cabeceras: una llamada a fetch que nunca resuelve por sí sola se aborta al vencer el presupuesto -> DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE', async () => {
    // A diferencia de "un stream detenido" (más abajo), aquí `fetch` mismo
    // nunca resuelve su promesa (como esperar indefinidamente conexión o
    // cabeceras): la única vía de salida es que el adaptador aborte la
    // señal entregada, y que esta implementación de `fetch` (como una real)
    // rechace al recibir el `abort`.
    const fetchImpl = ((_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;

    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 30 },
      fetchImpl,
    );
    const t0 = Date.now();
    const resultado = await descargador.descargar(URL_VALIDA);
    const transcurrido = Date.now() - t0;

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
    });
    // Acotado y determinista: sin sleeps largos, el timeout configurado es
    // de 30 ms; un margen de 2 s es solo para absorber jitter del runner.
    expect(transcurrido).toBeLessThan(2000);
  });

  it('un stream detenido (nunca termina) se aborta al vencer el timeout total', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // nunca encola nada ni cierra: simula un cuerpo colgado.
      },
    });
    const respuesta = new Response(stream, { status: 200 });
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 30 },
      fetchQueDevuelve(respuesta),
    );
    const t0 = Date.now();
    const resultado = await descargador.descargar(URL_VALIDA);
    const transcurrido = Date.now() - t0;
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(transcurrido).toBeLessThan(2000);
  });

  it('cancela realmente el lector del stream al vencer el timeout (no deja lecturas pendientes)', async () => {
    let cancelado = false;
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // nunca resuelve un chunk
      },
      cancel() {
        cancelado = true;
      },
    });
    const respuesta = new Response(stream, { status: 200 });
    const descargador = new DescargadorPdfIndiceRegistroOficialHttp(
      { timeoutMs: 30 },
      fetchQueDevuelve(respuesta),
    );
    await descargador.descargar(URL_VALIDA);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cancelado).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CatalogoRegistroOficialHttp } from '../catalogo/CatalogoRegistroOficialHttp';

/**
 * El adaptador se prueba contra un servidor HTTP local controlado (nunca el
 * sitio oficial): así se verifica el request real, el parsing y la seguridad
 * con fixtures deterministas, sin dependencias externas en CI.
 */

type RespuestaControlada = {
  status?: number;
  headers?: Record<string, string>;
  cuerpo?: string;
  demoraMs?: number;
};

function tarjeta(params: {
  titulo: string;
  numeroTitulo?: string;
  fecha: string;
  urlPdf: string;
}): string {
  const numeroTitulo = params.numeroTitulo
    ? `<h4 class="card__title_numero_imagen">${params.numeroTitulo}</h4>`
    : '';
  return `
    <article class="card-post">
      <h2 class="card__title_post_imagen">${params.titulo}</h2>
      ${numeroTitulo}
      <div class="txt_fecha_post_imagen">${params.fecha}\nQuito</div>
      <a class="cta_post_imagen" href="${params.urlPdf}">Descargar</a>
    </article>`;
}

function paginaAjax(tarjetas: string[], paginas: number[] = []): string {
  const paginacion =
    paginas.length > 0
      ? `<div>${paginas
          .map((p) => `<a data-page="${p}">${p}</a>`)
          .join('')}</div>`
      : '';
  return `<section>${tarjetas.join('')}${paginacion}</section>`;
}

const PDF_500 = 'https://cdn.example.com/registro-oficial-500.pdf';
const CONSULTA = {
  tipoPublicacionRegistroOficial: 'RO',
  numeroPublicacionRegistroOficial: 500,
  fechaPublicacionOficial: new Date('2026-05-04'),
};

describe('CatalogoRegistroOficialHttp', () => {
  let server: Server;
  let baseUrl: string;
  let respuestasPorPagina: Map<number, RespuestaControlada>;
  let formsRecibidos: URLSearchParams[];

  beforeEach(async () => {
    respuestasPorPagina = new Map();
    formsRecibidos = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        formsRecibidos.push(form);
        const page = Number(form.get('page') ?? '1');
        const respuesta = respuestasPorPagina.get(page) ?? {
          cuerpo: paginaAjax([]),
        };
        const responder = () => {
          res.statusCode = respuesta.status ?? 200;
          for (const [clave, valor] of Object.entries(respuesta.headers ?? {})) {
            res.setHeader(clave, valor);
          }
          if (!res.hasHeader('content-type')) {
            res.setHeader('content-type', 'text/html; charset=utf-8');
          }
          res.end(respuesta.cuerpo ?? '');
        };
        if (respuesta.demoraMs) {
          setTimeout(responder, respuesta.demoraMs);
        } else {
          responder();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function crearAdaptador(overrides: Partial<{ timeoutMs: number; maxBytes: number; dominios: string[] }> = {}) {
    return new CatalogoRegistroOficialHttp({
      baseUrl,
      dominiosPdfPermitidos: overrides.dominios ?? ['cdn.example.com'],
      timeoutMs: overrides.timeoutMs ?? 2000,
      maxBytesRespuesta: overrides.maxBytes ?? 5 * 1024 * 1024,
    });
  }

  function servirPagina(page: number, respuesta: RespuestaControlada): void {
    respuestasPorPagina.set(page, respuesta);
  }

  it('construye el request real del catálogo (carpeta-mes por tipo + fecha)', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
      ]),
    });

    await crearAdaptador().buscarEdiciones(CONSULTA);

    const form = formsRecibidos[0];
    expect(form.get('action')).toBe('get_term_post_kilur_con_imagen');
    expect(form.get('id_carpeta')).toBe('1954'); // RO
    expect(form.get('year_id')).toBe('2002'); // 2026
    expect(form.get('mes_id')).toBe('1983'); // mayo
    expect(form.get('name_folder')).toBe('Mayo');
    expect(form.get('page')).toBe('1');
  });

  it('parsea un fixture válido y resuelve la candidata con url y fecha', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: true,
      candidatas: [
        { urlPdf: PDF_500, fechaPublicacionOficial: new Date('2026-05-04') },
      ],
    });
  });

  it('acepta la respuesta JSON del sitio con el HTML en data', async () => {
    servirPagina(1, {
      headers: { 'content-type': 'application/json' },
      cuerpo: JSON.stringify({
        success: true,
        data: paginaAjax([
          tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
        ]),
      }),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: true,
      candidatas: [
        { urlPdf: PDF_500, fechaPublicacionOficial: new Date('2026-05-04') },
      ],
    });
  });

  it('devuelve consulta exitosa sin candidatas cuando no hay archivos', async () => {
    servirPagina(1, { cuerpo: 'Sin Archivos post' });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({ exitoso: true, candidatas: [] });
  });

  it('devuelve varias candidatas cuando el número tiene más de una URL', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: `${PDF_500}?v=1` }),
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'martes, 5 mayo 2026', urlPdf: `${PDF_500}?v=2` }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    if (!resultado.exitoso) {
      throw new Error('esperaba éxito');
    }
    expect(resultado.candidatas.map((c) => c.urlPdf)).toEqual([
      `${PDF_500}?v=1`,
      `${PDF_500}?v=2`,
    ]);
  });

  it('deduplica URLs idénticas del mismo número', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    if (!resultado.exitoso) {
      throw new Error('esperaba éxito');
    }
    expect(resultado.candidatas).toHaveLength(1);
  });

  it('ignora números que no corresponden a la consulta', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 499', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://cdn.example.com/ro-499.pdf' }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({ exitoso: true, candidatas: [] });
  });

  it('acumula candidatas recorriendo la paginación', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax(
        [tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: `${PDF_500}?v=1` })],
        [1, 2],
      ),
    });
    servirPagina(2, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'martes, 5 mayo 2026', urlPdf: `${PDF_500}?v=2` }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    if (!resultado.exitoso) {
      throw new Error('esperaba éxito');
    }
    expect(resultado.candidatas).toHaveLength(2);
    expect(formsRecibidos.map((f) => f.get('page'))).toEqual(['1', '2']);
  });

  it('una coincidencia con URL PDF de dominio no permitido es respuesta inválida (fail-closed)', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://malicioso.example/ro-500.pdf' }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('una coincidencia con URL PDF que no es HTTPS es respuesta inválida (fail-closed)', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: 'http://cdn.example.com/ro-500.pdf' }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('un redirect (3xx) se trata como respuesta inválida (no se sigue a ciegas)', async () => {
    servirPagina(1, {
      status: 302,
      headers: { location: 'https://malicioso.example/robado' },
      cuerpo: '',
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('un 4xx es respuesta inválida', async () => {
    servirPagina(1, { status: 400, cuerpo: 'Bad Request' });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('un 5xx es fallo transitorio', async () => {
    servirPagina(1, { status: 503, cuerpo: 'Service Unavailable' });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
  });

  it('un timeout es fallo transitorio', async () => {
    servirPagina(1, { demoraMs: 300, cuerpo: paginaAjax([]) });

    const resultado = await crearAdaptador({ timeoutMs: 50 }).buscarEdiciones(
      CONSULTA,
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
  });

  it('un cuerpo que supera el límite de bytes es respuesta inválida', async () => {
    servirPagina(1, { cuerpo: 'x'.repeat(5000) });

    const resultado = await crearAdaptador({ maxBytes: 1000 }).buscarEdiciones(
      CONSULTA,
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('un cuerpo no interpretable (sin HTML) es respuesta inválida', async () => {
    servirPagina(1, { headers: { 'content-type': 'application/json' }, cuerpo: JSON.stringify({ success: false }) });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('sin cobertura de taxonomía (año fuera de rango) es fallo tipado y no consulta', async () => {
    const resultado = await crearAdaptador().buscarEdiciones({
      ...CONSULTA,
      fechaPublicacionOficial: new Date('1999-05-04'),
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'COBERTURA_CATALOGO_NO_DISPONIBLE',
    });
    expect(formsRecibidos).toHaveLength(0);
  });

  it('un año posterior a la taxonomía (2027) es fallo tipado y no consulta', async () => {
    const resultado = await crearAdaptador().buscarEdiciones({
      ...CONSULTA,
      fechaPublicacionOficial: new Date('2027-05-04'),
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'COBERTURA_CATALOGO_NO_DISPONIBLE',
    });
    expect(formsRecibidos).toHaveLength(0);
  });

  it('un tipo fuera de la taxonomía es fallo tipado y no consulta', async () => {
    const resultado = await crearAdaptador().buscarEdiciones({
      ...CONSULTA,
      tipoPublicacionRegistroOficial: 'DESCONOCIDO',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'COBERTURA_CATALOGO_NO_DISPONIBLE',
    });
    expect(formsRecibidos).toHaveLength(0);
  });

  it('HTML de mantenimiento con 200 es respuesta inválida (fail-closed)', async () => {
    servirPagina(1, {
      cuerpo: '<html><body>Servicio temporalmente en mantenimiento</body></html>',
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('carpeta explícitamente vacía (marcador oficial) es éxito sin candidatas', async () => {
    servirPagina(1, { cuerpo: '<div>Sin Archivos post</div>' });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({ exitoso: true, candidatas: [] });
  });

  it('cards válidas presentes sin coincidencia de número es éxito sin candidatas', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 499', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://cdn.example.com/ro-499.pdf' }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({ exitoso: true, candidatas: [] });
  });

  it('anuncia más de 20 páginas: paginación truncada es búsqueda incompleta', async () => {
    // Cada página anuncia una página siguiente indefinidamente y trae una card
    // que no coincide, forzando recorrer hasta el tope sin terminar.
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        formsRecibidos.push(form);
        const page = Number(form.get('page') ?? '1');
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
          paginaAjax(
            [tarjeta({ titulo: 'Registro Oficial Nº 499', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://cdn.example.com/ro-499.pdf' })],
            [page, page + 1],
          ),
        );
      });
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'BUSQUEDA_CATALOGO_INCOMPLETA',
    });
    expect(formsRecibidos.length).toBeLessThanOrEqual(20);
  });

  it('una candidata que solo aparecería tras la página 20 no se resuelve parcialmente', async () => {
    // Todas las páginas hasta el tope anuncian más y no coinciden: la única
    // coincidencia (hipotética) viviría más allá del tope => incompleta.
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const page = Number(form.get('page') ?? '1');
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
          paginaAjax(
            [tarjeta({ titulo: 'Registro Oficial Nº 499', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://cdn.example.com/ro-499.pdf' })],
            [page, page + 1],
          ),
        );
      });
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'BUSQUEDA_CATALOGO_INCOMPLETA',
    });
  });

  it('REGRESIÓN: card coincidente sin enlace PDF no produce éxito sin candidatas', async () => {
    // Entrada mínima obligatoria de la auditoría: la card coincide con la
    // consulta (RO 500) pero no trae enlace PDF. Antes se descartaba en
    // silencio y el resultado era { exitoso: true, candidatas: [] }, lo que
    // permitía persistir NO_ENCONTRADA falsamente.
    servirPagina(1, {
      cuerpo: `<article>
        <h2 class="card__title_post_imagen">
          Registro Oficial Nº 500
        </h2>
        <div class="txt_fecha_post_imagen">
          lunes, 4 mayo 2026
        </div>
      </article>`,
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('card coincidente con enlace sin atributo href es respuesta inválida', async () => {
    servirPagina(1, {
      cuerpo: `<article>
        <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
        <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
        <a class="cta_post_imagen">Descargar</a>
      </article>`,
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('card coincidente con URL vacía es respuesta inválida', async () => {
    servirPagina(1, {
      cuerpo: `<article>
        <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
        <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
        <a class="cta_post_imagen" href="">Descargar</a>
      </article>`,
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('una card inválida de otro número no impide resolver la válida coincidente', async () => {
    // La card sin enlace pertenece demostrablemente a otro número (499): no
    // bloquea la resolución de la edición 500, que sí es confiable.
    servirPagina(1, {
      cuerpo: paginaAjax([
        `<article>
          <h2 class="card__title_post_imagen">Registro Oficial Nº 499</h2>
          <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
        </article>`,
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: true,
      candidatas: [
        { urlPdf: PDF_500, fechaPublicacionOficial: new Date('2026-05-04') },
      ],
    });
  });

  it('una card ambigua (sin número reconocible) no permite concluir ausencia', async () => {
    // No puede determinarse si la card corresponde a la edición consultada:
    // fail-closed, jamás { exitoso: true, candidatas: [] }.
    servirPagina(1, {
      cuerpo: `<article>
        <h2 class="card__title_post_imagen">Registro Oficial</h2>
        <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
        <a class="cta_post_imagen" href="https://cdn.example.com/ro.pdf">Descargar</a>
      </article>`,
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('una card ambigua (sin tipo reconocible) no permite concluir ausencia', async () => {
    servirPagina(1, {
      cuerpo: `<article>
        <h2 class="card__title_post_imagen">Documento Nº 500</h2>
        <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
        <a class="cta_post_imagen" href="https://cdn.example.com/doc.pdf">Descargar</a>
      </article>`,
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('una coincidencia con URL PDF malformada es respuesta inválida (fail-closed)', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: 'no-es-una-url' }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('una coincidencia con fecha imposible (31 feb) es respuesta inválida (fail-closed)', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'sabado, 31 febrero 2026', urlPdf: PDF_500 }),
      ]),
    });

    const resultado = await crearAdaptador().buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('reutiliza una sola descarga para consultas concurrentes de la misma carpeta-mes', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
        tarjeta({ titulo: 'Registro Oficial Nº 501', fecha: 'lunes, 4 mayo 2026', urlPdf: 'https://cdn.example.com/ro-501.pdf' }),
      ]),
    });
    const adaptador = crearAdaptador();

    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, indice) =>
        adaptador.buscarEdiciones({
          ...CONSULTA,
          numeroPublicacionRegistroOficial: indice % 2 === 0 ? 500 : 501,
        }),
      ),
    );

    expect(resultados.every((r) => r.exitoso)).toBe(true);
    // Una sola descarga (una sola página) pese a 10 consultas del mismo mes.
    expect(formsRecibidos).toHaveLength(1);
  });

  it('meses distintos no comparten la descarga cacheada', async () => {
    servirPagina(1, {
      cuerpo: paginaAjax([
        tarjeta({ titulo: 'Registro Oficial Nº 500', fecha: 'lunes, 4 mayo 2026', urlPdf: PDF_500 }),
      ]),
    });
    const adaptador = crearAdaptador();

    await adaptador.buscarEdiciones({
      ...CONSULTA,
      fechaPublicacionOficial: new Date('2026-05-04'),
    });
    await adaptador.buscarEdiciones({
      ...CONSULTA,
      fechaPublicacionOficial: new Date('2026-06-04'),
    });

    const meses = formsRecibidos.map((f) => f.get('mes_id'));
    expect(new Set(meses).size).toBe(2);
  });
});

/**
 * Reintentos, presupuesto total y caché se prueban con un `fetch` inyectado
 * para controlar con precisión la secuencia de respuestas y el reloj, sin
 * timers reales que ralenticen la suite.
 */
describe('CatalogoRegistroOficialHttp (reintentos, presupuesto y caché)', () => {
  const PDF = 'https://cdn.example.com/ro-500.pdf';
  const CONSULTA = {
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-04'),
  };

  function paginaConCandidata(): string {
    return `<section><article>
      <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
      <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026\nQuito</div>
      <a class="cta_post_imagen" href="${PDF}">Descargar</a>
    </article></section>`;
  }

  function respuestaHtml(cuerpo: string, status = 200, headers: Record<string, string> = {}) {
    return new Response(cuerpo, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    });
  }

  function crearReloj(inicio = 0) {
    let t = inicio;
    return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
  }

  function crearAdaptador(
    fetchImpl: typeof fetch,
    opciones: {
      esperar?: (ms: number) => Promise<void>;
      ahora?: () => number;
      timeoutMs?: number;
    } = {},
  ) {
    return new CatalogoRegistroOficialHttp(
      {
        baseUrl: 'https://www.registroficial.gob.ec',
        dominiosPdfPermitidos: ['cdn.example.com'],
        timeoutMs: opciones.timeoutMs ?? 60_000,
        maxBytesRespuesta: 5 * 1024 * 1024,
      },
      fetchImpl,
      { esperar: opciones.esperar, ahora: opciones.ahora },
    );
  }

  it('429 seguido de éxito resuelve la candidata', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('rate limit', 429))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, { esperar: async () => undefined });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: true,
      candidatas: [{ urlPdf: PDF, fechaPublicacionOficial: new Date('2026-05-04') }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('503 seguido de éxito resuelve la candidata', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('unavailable', 503))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, { esperar: async () => undefined });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos (3 intentos) y devuelve fallo transitorio', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaHtml('rate limit', 429));
    const adaptador = crearAdaptador(fetchImpl, { esperar: async () => undefined });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('respeta Retry-After válido para el backoff', async () => {
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('rate limit', 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([2000]);
  });

  it('respeta completo un Retry-After que supera el backoff máximo local', async () => {
    // Retry-After: 10 debe esperar exactamente 10 s (no recortarse a los 2 s
    // del backoff máximo local) cuando cabe en el presupuesto.
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('rate limit', 429, { 'retry-after': '10' }))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      timeoutMs: 60_000,
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([10_000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('un Retry-After que no cabe en el presupuesto no espera parcialmente ni reintenta', async () => {
    const reloj = crearReloj();
    const esperas: number[] = [];
    const fetchImpl = jest.fn<typeof fetch>().mockImplementation(async () => {
      reloj.avanzar(100);
      return respuestaHtml('rate limit', 429, { 'retry-after': '10' });
    });
    const adaptador = crearAdaptador(fetchImpl, {
      timeoutMs: 5_000,
      ahora: reloj.ahora,
      esperar: async (ms) => {
        esperas.push(ms);
        reloj.avanzar(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(esperas).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('respeta un Retry-After como fecha HTTP futura (delta exacto)', async () => {
    const base = Date.parse('Wed, 01 Jul 2026 12:00:00 GMT');
    const reloj = crearReloj(base);
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respuestaHtml('rate limit', 429, {
          'retry-after': 'Wed, 01 Jul 2026 12:00:07 GMT',
        }),
      )
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      timeoutMs: 60_000,
      ahora: reloj.ahora,
      esperar: async (ms) => {
        esperas.push(ms);
        reloj.avanzar(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([7_000]);
  });

  it('una fecha HTTP fuera del presupuesto no reintenta', async () => {
    const base = Date.parse('Wed, 01 Jul 2026 12:00:00 GMT');
    const reloj = crearReloj(base);
    const esperas: number[] = [];
    const fetchImpl = jest.fn<typeof fetch>().mockImplementation(async () => {
      reloj.avanzar(100);
      return respuestaHtml('rate limit', 429, {
        'retry-after': 'Wed, 01 Jul 2026 12:00:10 GMT',
      });
    });
    const adaptador = crearAdaptador(fetchImpl, {
      timeoutMs: 5_000,
      ahora: reloj.ahora,
      esperar: async (ms) => {
        esperas.push(ms);
        reloj.avanzar(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(esperas).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un Retry-After inválido usa el backoff local acotado', async () => {
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('rate limit', 429, { 'retry-after': 'no-es-valido' }))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([200]);
  });

  it('sin Retry-After usa el backoff local acotado', async () => {
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('unavailable', 503))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([200]);
  });

  it('un Retry-After en el pasado reintenta de inmediato (espera 0, determinista)', async () => {
    const base = Date.parse('Wed, 01 Jul 2026 12:00:00 GMT');
    const reloj = crearReloj(base);
    const esperas: number[] = [];
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respuestaHtml('rate limit', 429, {
          'retry-after': 'Wed, 01 Jul 2026 11:59:55 GMT',
        }),
      )
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, {
      ahora: reloj.ahora,
      esperar: async (ms) => {
        esperas.push(ms);
        reloj.avanzar(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado.exitoso).toBe(true);
    expect(esperas).toEqual([0]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('agota el presupuesto total antes que los reintentos', async () => {
    const reloj = crearReloj();
    const fetchImpl = jest.fn<typeof fetch>().mockImplementation(async () => {
      reloj.avanzar(400);
      return respuestaHtml('rate limit', 429);
    });
    const adaptador = crearAdaptador(fetchImpl, {
      timeoutMs: 1000,
      ahora: reloj.ahora,
      esperar: async (ms) => {
        reloj.avanzar(ms);
      },
    });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    // Menos de 3 intentos: el presupuesto venció primero.
    expect(fetchImpl.mock.calls.length).toBeLessThan(3);
  });

  it('un 400 no se reintenta', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaHtml('bad request', 400));
    const adaptador = crearAdaptador(fetchImpl, { esperar: async () => undefined });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('no cachea un fallo transitorio: una consulta posterior reintenta', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaHtml('unavailable', 503))
      .mockResolvedValueOnce(respuestaHtml('unavailable', 503))
      .mockResolvedValueOnce(respuestaHtml('unavailable', 503))
      .mockResolvedValueOnce(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl, { esperar: async () => undefined });

    const primero = await adaptador.buscarEdiciones(CONSULTA);
    const segundo = await adaptador.buscarEdiciones(CONSULTA);

    expect(primero.exitoso).toBe(false);
    expect(segundo.exitoso).toBe(true);
  });

  it('reutiliza una descarga exitosa cacheada dentro del TTL', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaHtml(paginaConCandidata()));
    const adaptador = crearAdaptador(fetchImpl);

    await adaptador.buscarEdiciones(CONSULTA);
    await adaptador.buscarEdiciones(CONSULTA);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un body que nunca termina se aborta por timeout y es fallo transitorio', async () => {
    // El servidor responde headers 200 pero jamás cierra el body: el
    // presupuesto total debe abortar la lectura (no quedar bloqueado) y el
    // resultado es transitorio, nunca RESPUESTA_CATALOGO_INVALIDA ni éxito.
    let cancelado = false;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel: () => {
        cancelado = true;
      },
    });
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const adaptador = crearAdaptador(fetchImpl, { timeoutMs: 120 });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(cancelado).toBe(true);
  });

  it('un body que entrega chunks y luego se detiene vence por timeout', async () => {
    let cancelado = false;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('<section><article>'));
      },
      pull: () => new Promise<void>(() => undefined),
      cancel: () => {
        cancelado = true;
      },
    });
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const adaptador = crearAdaptador(fetchImpl, { timeoutMs: 120 });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(cancelado).toBe(true);
  });

  it('un body entregado por stream que termina antes del timeout se procesa normalmente', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode(paginaConCandidata()));
        controller.close();
      },
    });
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const adaptador = crearAdaptador(fetchImpl, { timeoutMs: 5_000 });

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: true,
      candidatas: [{ urlPdf: PDF, fechaPublicacionOficial: new Date('2026-05-04') }],
    });
  });

  it('un body por stream que supera el máximo de bytes sigue siendo respuesta inválida', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const adaptador = new CatalogoRegistroOficialHttp(
      {
        baseUrl: 'https://www.registroficial.gob.ec',
        dominiosPdfPermitidos: ['cdn.example.com'],
        timeoutMs: 5_000,
        maxBytesRespuesta: 4_096,
      },
      fetchImpl,
      { esperar: async () => undefined },
    );

    const resultado = await adaptador.buscarEdiciones(CONSULTA);

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'RESPUESTA_CATALOGO_INVALIDA',
    });
  });

  it('la caché expira: pasado el TTL se vuelve a descargar', async () => {
    const reloj = crearReloj();
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockImplementation(async () => respuestaHtml(paginaConCandidata()));
    const adaptador = new CatalogoRegistroOficialHttp(
      {
        baseUrl: 'https://www.registroficial.gob.ec',
        dominiosPdfPermitidos: ['cdn.example.com'],
        timeoutMs: 60_000,
        maxBytesRespuesta: 5 * 1024 * 1024,
        ttlCacheMs: 1000,
      },
      fetchImpl,
      { ahora: reloj.ahora, esperar: async () => undefined },
    );

    await adaptador.buscarEdiciones(CONSULTA);
    reloj.avanzar(1500);
    await adaptador.buscarEdiciones(CONSULTA);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

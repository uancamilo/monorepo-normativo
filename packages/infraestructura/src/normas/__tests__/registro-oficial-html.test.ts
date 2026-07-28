import { describe, expect, it } from '@jest/globals';
import {
  extraerCardsRegistroOficial,
  tieneEstructuraCardsRegistroOficial,
} from '../catalogo/registro-oficial-html';

function card(fecha: string): string {
  return `<section><article>
    <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
    <div class="txt_fecha_post_imagen">${fecha}\nQuito</div>
    <a class="cta_post_imagen" href="https://cdn.example.com/ro-500.pdf">Descargar</a>
  </article></section>`;
}

describe('parseo de fecha de card (round-trip calendárico)', () => {
  it('acepta 29 de febrero en año bisiesto', () => {
    const [c] = extraerCardsRegistroOficial(card('jueves, 29 febrero 2024')).validas;
    expect(c.fechaPublicacion).toEqual(new Date('2024-02-29'));
    expect(c.fechaInvalida).toBe(false);
  });

  it('rechaza 29 de febrero en año no bisiesto', () => {
    const [c] = extraerCardsRegistroOficial(card('lunes, 29 febrero 2025')).validas;
    expect(c.fechaPublicacion).toBeNull();
    expect(c.fechaInvalida).toBe(true);
  });

  it('rechaza 31 de febrero (no se normaliza a marzo)', () => {
    const [c] = extraerCardsRegistroOficial(card('sabado, 31 febrero 2026')).validas;
    expect(c.fechaPublicacion).toBeNull();
    expect(c.fechaInvalida).toBe(true);
  });

  it('rechaza 31 de abril', () => {
    const [c] = extraerCardsRegistroOficial(card('martes, 31 abril 2026')).validas;
    expect(c.fechaPublicacion).toBeNull();
    expect(c.fechaInvalida).toBe(true);
  });

  it('acepta una fecha válida', () => {
    const [c] = extraerCardsRegistroOficial(card('lunes, 4 mayo 2026')).validas;
    expect(c.fechaPublicacion).toEqual(new Date('2026-05-04'));
    expect(c.fechaInvalida).toBe(false);
  });

  it('marca fechaInvalida ante un formato desconocido', () => {
    const [c] = extraerCardsRegistroOficial(card('fecha ilegible')).validas;
    expect(c.fechaPublicacion).toBeNull();
    expect(c.fechaInvalida).toBe(true);
  });
});

describe('cards reconocidas pero no confiables (no se descartan en silencio)', () => {
  it('card coincidente sin enlace a.cta_post_imagen conserva número, tipo y razón', () => {
    const html = `<article>
      <h2 class="card__title_post_imagen">
        Registro Oficial Nº 500
      </h2>
      <div class="txt_fecha_post_imagen">
        lunes, 4 mayo 2026
      </div>
    </article>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.noConfiables).toEqual([
      { numero: 500, abreviatura: 'RO', razon: 'URL_AUSENTE' },
    ]);
  });

  it('card con enlace sin atributo href es URL_AUSENTE', () => {
    const html = `<article>
      <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
      <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
      <a class="cta_post_imagen">Descargar</a>
    </article>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.noConfiables).toEqual([
      { numero: 500, abreviatura: 'RO', razon: 'URL_AUSENTE' },
    ]);
  });

  it('card con href vacío es URL_AUSENTE', () => {
    const html = `<article>
      <h2 class="card__title_post_imagen">Registro Oficial Nº 500</h2>
      <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
      <a class="cta_post_imagen" href="   ">Descargar</a>
    </article>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.noConfiables).toEqual([
      { numero: 500, abreviatura: 'RO', razon: 'URL_AUSENTE' },
    ]);
  });

  it('card sin número reconocible es ambigua y conserva el tipo', () => {
    const html = `<article>
      <h2 class="card__title_post_imagen">Registro Oficial</h2>
      <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
      <a class="cta_post_imagen" href="https://cdn.example.com/ro.pdf">Descargar</a>
    </article>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.noConfiables).toEqual([
      { numero: null, abreviatura: 'RO', razon: 'DATOS_AMBIGUOS' },
    ]);
  });

  it('card sin tipo reconocible es ambigua y conserva el número', () => {
    const html = `<article>
      <h2 class="card__title_post_imagen">Documento Nº 500</h2>
      <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
      <a class="cta_post_imagen" href="https://cdn.example.com/doc-500.pdf">Descargar</a>
    </article>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.noConfiables).toEqual([
      { numero: 500, abreviatura: null, razon: 'DATOS_AMBIGUOS' },
    ]);
  });

  it('una card no confiable no impide extraer una card válida vecina', () => {
    const html = `<section>
      <article>
        <h2 class="card__title_post_imagen">Registro Oficial Nº 499</h2>
        <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026</div>
      </article>
      ${card('lunes, 4 mayo 2026')}
    </section>`;

    const resultado = extraerCardsRegistroOficial(html);

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].numero).toBe(500);
    expect(resultado.noConfiables).toEqual([
      { numero: 499, abreviatura: 'RO', razon: 'URL_AUSENTE' },
    ]);
  });
});

describe('tieneEstructuraCardsRegistroOficial', () => {
  it('reconoce una página con cards', () => {
    expect(tieneEstructuraCardsRegistroOficial(card('lunes, 4 mayo 2026'))).toBe(
      true,
    );
  });

  it('no reconoce una página de mantenimiento', () => {
    expect(
      tieneEstructuraCardsRegistroOficial(
        '<html><body>Servicio temporalmente en mantenimiento</body></html>',
      ),
    ).toBe(false);
  });
});

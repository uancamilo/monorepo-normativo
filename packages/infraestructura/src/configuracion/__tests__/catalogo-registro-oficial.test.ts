import { describe, expect, it } from '@jest/globals';
import { obtenerConfiguracionCatalogoRegistroOficial } from '../catalogo-registro-oficial';

const BASE = 'https://www.registroficial.gob.ec';

describe('obtenerConfiguracionCatalogoRegistroOficial', () => {
  it('deshabilitado por defecto (sin variables) sin exigir base URL', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({});

    expect(config.habilitado).toBe(false);
    expect(config.baseUrl).toBe('');
  });

  it('deshabilitado devuelve valores predeterminados deterministas y seguros', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'false',
    });

    expect(config).toEqual({
      habilitado: false,
      baseUrl: '',
      dominiosPdfPermitidos: [],
      timeoutMs: 15_000,
      maxConcurrencia: 4,
      maxEdicionesPorEjecucion: 50,
    });
  });

  it.each([
    ['base URL inválida', { CATALOGO_REGISTRO_OFICIAL_BASE_URL: 'no-es-una-url' }],
    ['timeout inválido', { CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS: 'abc' }],
    ['timeout fuera de rango', { CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS: '999999' }],
    ['concurrencia inválida', { CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA: '-1' }],
    [
      'máximo de ediciones inválido',
      { CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION: '0' },
    ],
    [
      'allowlist vacía',
      { CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF: ' , ' },
    ],
  ])(
    'deshabilitado ignora una variable opcional residual con %s (no impide el arranque)',
    (_nombre, residual) => {
      const config = obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'false',
        ...residual,
      });

      expect(config).toEqual({
        habilitado: false,
        baseUrl: '',
        dominiosPdfPermitidos: [],
        timeoutMs: 15_000,
        maxConcurrencia: 4,
        maxEdicionesPorEjecucion: 50,
      });
    },
  );

  it('habilitado y bien configurado inyecta base URL y allowlist por defecto', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
    });

    expect(config.habilitado).toBe(true);
    expect(config.baseUrl).toBe(`${BASE}/`);
    expect(config.dominiosPdfPermitidos).toEqual(['www.registroficial.gob.ec']);
    expect(config.timeoutMs).toBe(15_000);
    expect(config.maxConcurrencia).toBe(4);
    expect(config.maxEdicionesPorEjecucion).toBe(50);
  });

  it('permite una allowlist de dominios PDF explícita', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
      CATALOGO_REGISTRO_OFICIAL_DOMINIOS_PDF:
        'www.registroficial.gob.ec, cdn.registroficial.gob.ec',
    });

    expect(config.dominiosPdfPermitidos).toEqual([
      'www.registroficial.gob.ec',
      'cdn.registroficial.gob.ec',
    ]);
  });

  it('habilitado permite http solo en localhost (pruebas locales)', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      CATALOGO_REGISTRO_OFICIAL_BASE_URL: 'http://localhost:3999',
    });

    expect(config.habilitado).toBe(true);
    expect(config.dominiosPdfPermitidos).toEqual(['localhost:3999']);
  });

  it('habilitado sin base URL falla en el arranque', () => {
    expect(() =>
      obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      }),
    ).toThrow(/BASE_URL/);
  });

  it('habilitado con base URL http no local falla en el arranque', () => {
    expect(() =>
      obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
        CATALOGO_REGISTRO_OFICIAL_BASE_URL: 'http://www.registroficial.gob.ec',
      }),
    ).toThrow(/HTTPS/);
  });

  it('un valor no booleano de HABILITADO falla', () => {
    expect(() =>
      obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'sí',
      }),
    ).toThrow(/HABILITADO/);
  });

  it.each([
    'CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS',
    'CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA',
    'CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION',
  ])('%s no positivo falla', (clave) => {
    expect(() =>
      obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
        CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
        [clave]: '0',
      }),
    ).toThrow(new RegExp(clave));
  });

  it.each([
    ['CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS', '-1'],
    ['CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS', '1.5'],
    ['CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS', '30001'],
    ['CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA', '5'],
    ['CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA', '2.5'],
    ['CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION', '51'],
    ['CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION', '-3'],
  ])('%s fuera de rango (%s) falla en el arranque', (clave, valor) => {
    expect(() =>
      obtenerConfiguracionCatalogoRegistroOficial({
        CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
        CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
        [clave]: valor,
      }),
    ).toThrow(new RegExp(clave));
  });

  it('acepta los límites máximos exactos', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
      CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS: '30000',
      CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA: '4',
      CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION: '50',
    });

    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxConcurrencia).toBe(4);
    expect(config.maxEdicionesPorEjecucion).toBe(50);
  });

  it('acepta los límites mínimos exactos', () => {
    const config = obtenerConfiguracionCatalogoRegistroOficial({
      CATALOGO_REGISTRO_OFICIAL_HABILITADO: 'true',
      CATALOGO_REGISTRO_OFICIAL_BASE_URL: BASE,
      CATALOGO_REGISTRO_OFICIAL_TIMEOUT_MS: '1000',
      CATALOGO_REGISTRO_OFICIAL_MAX_CONCURRENCIA: '1',
      CATALOGO_REGISTRO_OFICIAL_MAX_EDICIONES_POR_EJECUCION: '1',
    });

    expect(config.timeoutMs).toBe(1000);
    expect(config.maxConcurrencia).toBe(1);
    expect(config.maxEdicionesPorEjecucion).toBe(1);
  });
});

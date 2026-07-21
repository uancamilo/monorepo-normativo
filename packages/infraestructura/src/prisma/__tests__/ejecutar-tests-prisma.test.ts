import { describe, expect, it } from '@jest/globals';

// El runner es CommonJS puro (se ejecuta con `node scripts/...`). Se prueba
// solo la validación/orquestación de la URL, sin lanzar migraciones ni Jest.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  prepararUrlTestsPrisma,
} = require('../../../scripts/ejecutar-tests-prisma');

const URL_TEST_LOCAL =
  'postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public';

describe('prepararUrlTestsPrisma', () => {
  it('exige TEST_DATABASE_URL: falla antes de migrar si falta', () => {
    expect(() => prepararUrlTestsPrisma({})).toThrow('TEST_DATABASE_URL');
  });

  it('no acepta DATABASE_URL como sustituto de TEST_DATABASE_URL', () => {
    expect(() =>
      prepararUrlTestsPrisma({
        DATABASE_URL:
          'postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public',
      }),
    ).toThrow('TEST_DATABASE_URL');
  });

  it('rechaza una base distinta de normativo_test', () => {
    expect(() =>
      prepararUrlTestsPrisma({
        TEST_DATABASE_URL:
          'postgresql://normativo:normativo@localhost:5433/normativo?schema=public',
      }),
    ).toThrow('normativo_test');
  });

  it('rechaza host no local sin confirmación explícita', () => {
    expect(() =>
      prepararUrlTestsPrisma({
        TEST_DATABASE_URL:
          'postgresql://normativo:normativo@db.example.com:5433/normativo_test?schema=public',
      }),
    ).toThrow('localhost');
  });

  it('acepta una URL de test local válida', () => {
    expect(prepararUrlTestsPrisma({ TEST_DATABASE_URL: URL_TEST_LOCAL })).toBe(
      URL_TEST_LOCAL,
    );
  });

  it('permite una URL de test no local solo con PERMITIR_TEST_DATABASE_URL_NO_LOCAL=true', () => {
    const urlRemota =
      'postgresql://normativo:normativo@db.example.com:5433/normativo_test?schema=public';

    expect(
      prepararUrlTestsPrisma({
        TEST_DATABASE_URL: urlRemota,
        PERMITIR_TEST_DATABASE_URL_NO_LOCAL: 'true',
      }),
    ).toBe(urlRemota);
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  obtenerTestDatabaseUrlDesdeEntorno,
  validarTestDatabaseUrl,
} from '../validar-url-base-datos-test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { obtenerUrlSeedDesdeEntorno } = require('../../../scripts/seed-prisma');

describe('validarTestDatabaseUrl', () => {
  const urlTestLocal =
    'postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public';

  it('acepta normativo_test en localhost', () => {
    expect(validarTestDatabaseUrl(urlTestLocal, {})).toBe(urlTestLocal);
  });

  it('retorna undefined cuando no existe TEST_DATABASE_URL', () => {
    expect(obtenerTestDatabaseUrlDesdeEntorno({})).toBeUndefined();
  });

  it('rechaza base distinta de normativo_test', () => {
    expect(() =>
      validarTestDatabaseUrl(
        'postgresql://normativo:normativo@localhost:5433/normativo?schema=public',
        {},
      ),
    ).toThrow('normativo_test');
  });

  it('rechaza host no local por defecto', () => {
    expect(() =>
      validarTestDatabaseUrl(
        'postgresql://normativo:normativo@db.example.com:5433/normativo_test?schema=public',
        {},
      ),
    ).toThrow('localhost');
  });

  it('permite host no local con confirmación explícita si la base sigue siendo normativo_test', () => {
    const urlRemota =
      'postgresql://normativo:normativo@db.example.com:5433/normativo_test?schema=public';

    expect(
      validarTestDatabaseUrl(urlRemota, {
        PERMITIR_TEST_DATABASE_URL_NO_LOCAL: 'true',
      }),
    ).toBe(urlRemota);
  });

  it('rechaza base distinta de normativo_test incluso con confirmación de host no local', () => {
    expect(() =>
      validarTestDatabaseUrl(
        'postgresql://normativo:normativo@db.example.com:5433/otra_base?schema=public',
        {
          PERMITIR_TEST_DATABASE_URL_NO_LOCAL: 'true',
        },
      ),
    ).toThrow('normativo_test');
  });
});

describe('obtenerUrlSeedDesdeEntorno', () => {
  it('usa TEST_DATABASE_URL validada para seed', () => {
    const url =
      'postgresql://normativo:normativo@127.0.0.1:5433/normativo_test?schema=public';

    expect(obtenerUrlSeedDesdeEntorno({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('rechaza DATABASE_URL sin confirmación explícita', () => {
    expect(() =>
      obtenerUrlSeedDesdeEntorno({
        DATABASE_URL:
          'postgresql://normativo:normativo@localhost:5432/normativo?schema=public',
      }),
    ).toThrow('PERMITIR_SEED_DESARROLLO=true');
  });

  it('permite DATABASE_URL solo con PERMITIR_SEED_DESARROLLO=true', () => {
    const url =
      'postgresql://normativo:normativo@localhost:5432/normativo?schema=public';

    expect(
      obtenerUrlSeedDesdeEntorno({
        DATABASE_URL: url,
        PERMITIR_SEED_DESARROLLO: 'true',
      }),
    ).toBe(url);
  });
});

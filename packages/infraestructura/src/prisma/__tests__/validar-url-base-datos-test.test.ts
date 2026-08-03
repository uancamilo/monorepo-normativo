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

describe('validarTestDatabaseUrl — bases efímeras (PERMITIR_TEST_DATABASE_EFIMERA)', () => {
  const urlEfimeraLocal =
    'postgresql://normativo:normativo@localhost:5433/normativo_test_temporal?schema=public';

  it('1. acepta normativo_test local sin opt-in efímero (comportamiento preexistente)', () => {
    expect(
      validarTestDatabaseUrl(
        'postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public',
        {},
      ),
    ).toBe(
      'postgresql://normativo:normativo@localhost:5433/normativo_test?schema=public',
    );
  });

  it('2. rechaza normativo_test_temporal local sin opt-in', () => {
    expect(() => validarTestDatabaseUrl(urlEfimeraLocal, {})).toThrow();
  });

  it('3. acepta normativo_test_temporal local con PERMITIR_TEST_DATABASE_EFIMERA=true', () => {
    expect(
      validarTestDatabaseUrl(urlEfimeraLocal, {
        PERMITIR_TEST_DATABASE_EFIMERA: 'true',
      }),
    ).toBe(urlEfimeraLocal);
  });

  it.each(['false', '1', 'TRUE', 'yes', 'True', ' true', 'true '])(
    '4. rechaza la efímera cuando PERMITIR_TEST_DATABASE_EFIMERA=%s',
    (valor) => {
      expect(() =>
        validarTestDatabaseUrl(urlEfimeraLocal, {
          PERMITIR_TEST_DATABASE_EFIMERA: valor,
        }),
      ).toThrow();
    },
  );

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    '5. acepta bases efímeras en host local %s',
    (host) => {
      const url = `postgresql://normativo:normativo@${host}:5433/normativo_test_temporal?schema=public`;
      expect(
        validarTestDatabaseUrl(url, {
          PERMITIR_TEST_DATABASE_EFIMERA: 'true',
        }),
      ).toBe(url);
    },
  );

  it('6. rechaza una base efímera en host remoto aunque tenga el opt-in efímero', () => {
    const urlRemota =
      'postgresql://normativo:normativo@db.example.com:5433/normativo_test_temporal?schema=public';
    expect(() =>
      validarTestDatabaseUrl(urlRemota, {
        PERMITIR_TEST_DATABASE_EFIMERA: 'true',
      }),
    ).toThrow();
  });

  it('7. rechaza una base efímera remota aunque tenga ambos opt-ins', () => {
    const urlRemota =
      'postgresql://normativo:normativo@db.example.com:5433/normativo_test_temporal?schema=public';
    expect(() =>
      validarTestDatabaseUrl(urlRemota, {
        PERMITIR_TEST_DATABASE_EFIMERA: 'true',
        PERMITIR_TEST_DATABASE_URL_NO_LOCAL: 'true',
      }),
    ).toThrow();
  });

  it('8. conserva el comportamiento preexistente: normativo_test remota solo con PERMITIR_TEST_DATABASE_URL_NO_LOCAL=true', () => {
    const urlRemota =
      'postgresql://normativo:normativo@db.example.com:5433/normativo_test?schema=public';
    expect(
      validarTestDatabaseUrl(urlRemota, {
        PERMITIR_TEST_DATABASE_URL_NO_LOCAL: 'true',
      }),
    ).toBe(urlRemota);
  });

  it.each([
    ['normativo_test_', 'sin sufijo'],
    ['normativo_test_Temporal', 'sufijo con mayúsculas'],
    ['normativo_test_lote-id', 'sufijo con guion'],
    ['normativo_test_lote.id', 'sufijo con punto'],
    ['normativo_test_lote id', 'sufijo con espacio'],
    ['normativo_test_lote/id', 'sufijo con barra'],
    [`normativo_test_${'a'.repeat(49)}`, 'sufijo de más de 48 caracteres'],
    ['xnormativo_test_temporal', 'contiene parcialmente el prefijo'],
    ['normativo_testx_temporal', 'prefijo alterado'],
    ['otra_base', 'cualquier otra base'],
  ])('9. rechaza %s (%s) incluso con el opt-in efímero', (nombreBase) => {
    const url = `postgresql://normativo:normativo@localhost:5433/${encodeURIComponent(nombreBase)}?schema=public`;
    expect(() =>
      validarTestDatabaseUrl(url, {
        PERMITIR_TEST_DATABASE_EFIMERA: 'true',
      }),
    ).toThrow();
  });

  it('10. la URL devuelta es exactamente la recibida, sin reescribir credenciales ni query string', () => {
    const url =
      'postgresql://normativo:contrasena-secreta@localhost:5433/normativo_test_temporal?schema=public&connection_limit=5';
    expect(
      validarTestDatabaseUrl(url, {
        PERMITIR_TEST_DATABASE_EFIMERA: 'true',
      }),
    ).toBe(url);
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

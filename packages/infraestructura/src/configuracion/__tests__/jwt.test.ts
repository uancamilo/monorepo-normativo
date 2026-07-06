import { describe, expect, it } from '@jest/globals';
import { JWT_SECRET_DESARROLLO, obtenerConfiguracionJwt } from '../jwt';

const SECRETO_LARGO = 'secreto-de-produccion-con-longitud-suficiente-hs256';

describe('obtenerConfiguracionJwt', () => {
  it('en producción exige JWT_SECRET', () => {
    expect(() => obtenerConfiguracionJwt({ NODE_ENV: 'production' })).toThrow(
      'JWT_SECRET debe estar configurado en producción',
    );
  });

  it('en producción rechaza JWT_SECRET corto', () => {
    expect(() =>
      obtenerConfiguracionJwt({ NODE_ENV: 'production', JWT_SECRET: 'corto' }),
    ).toThrow(/al menos 32 caracteres/);
  });

  it('en producción acepta JWT_SECRET largo', () => {
    const configuracion = obtenerConfiguracionJwt({
      NODE_ENV: 'production',
      JWT_SECRET: SECRETO_LARGO,
    });

    expect(configuracion.secreto).toBe(SECRETO_LARGO);
  });

  it('fuera de producción cae al secreto explícito de desarrollo', () => {
    const configuracion = obtenerConfiguracionJwt({});

    expect(configuracion.secreto).toBe(JWT_SECRET_DESARROLLO);
  });

  it('fuera de producción respeta JWT_SECRET si está definido', () => {
    const configuracion = obtenerConfiguracionJwt({ JWT_SECRET: 'mi-secreto' });

    expect(configuracion.secreto).toBe('mi-secreto');
  });

  it('propaga emisor y audiencia opcionales y omite vacíos', () => {
    const completa = obtenerConfiguracionJwt({
      JWT_SECRET: 'mi-secreto',
      JWT_ISSUER: 'normativo',
      JWT_AUDIENCE: 'api-normativo',
    });
    const vacios = obtenerConfiguracionJwt({
      JWT_SECRET: 'mi-secreto',
      JWT_ISSUER: '  ',
      JWT_AUDIENCE: '',
    });

    expect(completa.emisor).toBe('normativo');
    expect(completa.audiencia).toBe('api-normativo');
    expect(vacios.emisor).toBeUndefined();
    expect(vacios.audiencia).toBeUndefined();
  });
});

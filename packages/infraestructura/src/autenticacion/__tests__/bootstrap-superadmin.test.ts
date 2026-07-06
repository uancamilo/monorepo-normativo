import { describe, expect, it } from '@jest/globals';

// Script CJS operativo con funciones puras testeables (patrón validar-url/seed).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  LONGITUD_MINIMA_PASSWORD,
  leerConfiguracionBootstrapSuperadmin,
  validarPasswordBootstrap,
} = require('../../../scripts/bootstrap-superadmin');

const PASSWORD_VALIDA = 'contrasena-larga-segura';
const URL_LOCAL = 'postgresql://normativo:normativo@localhost:5432/normativo?schema=public';

function entornoValido(overrides: Record<string, string | undefined> = {}) {
  return {
    PERMITIR_BOOTSTRAP_SUPERADMIN: 'true',
    DATABASE_URL: URL_LOCAL,
    BOOTSTRAP_SUPERADMIN_CORREO: 'superadmin@ejemplo.com',
    BOOTSTRAP_SUPERADMIN_PASSWORD: PASSWORD_VALIDA,
    ...overrides,
  };
}

describe('validarPasswordBootstrap', () => {
  it('rechaza contraseña vacía o solo espacios', () => {
    expect(() => validarPasswordBootstrap('')).toThrow(/no puede estar vacía/);
    expect(() => validarPasswordBootstrap('   ')).toThrow(/no puede estar vacía/);
    expect(() => validarPasswordBootstrap(undefined)).toThrow(
      /no puede estar vacía/,
    );
  });

  it(`rechaza contraseñas de menos de ${LONGITUD_MINIMA_PASSWORD} caracteres`, () => {
    expect(() => validarPasswordBootstrap('corta123')).toThrow(
      new RegExp(`al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`),
    );
  });

  it('acepta una contraseña que cumple la política mínima', () => {
    expect(validarPasswordBootstrap(PASSWORD_VALIDA)).toBe(PASSWORD_VALIDA);
  });

  it('los mensajes de error no incluyen la contraseña', () => {
    try {
      validarPasswordBootstrap('secreta-corta');
      throw new Error('debió lanzar');
    } catch (error) {
      expect((error as Error).message).not.toContain('secreta');
    }
  });
});

describe('leerConfiguracionBootstrapSuperadmin', () => {
  it('exige confirmación explícita PERMITIR_BOOTSTRAP_SUPERADMIN=true', () => {
    expect(() =>
      leerConfiguracionBootstrapSuperadmin(
        entornoValido({ PERMITIR_BOOTSTRAP_SUPERADMIN: undefined }),
      ),
    ).toThrow(/PERMITIR_BOOTSTRAP_SUPERADMIN=true/);
  });

  it('exige DATABASE_URL', () => {
    expect(() =>
      leerConfiguracionBootstrapSuperadmin(
        entornoValido({ DATABASE_URL: undefined }),
      ),
    ).toThrow(/DATABASE_URL debe estar configurada/);
  });

  it('rechaza host no local sin la confirmación adicional', () => {
    expect(() =>
      leerConfiguracionBootstrapSuperadmin(
        entornoValido({
          DATABASE_URL: 'postgresql://u:p@db.produccion.com:5432/normativo',
        }),
      ),
    ).toThrow(/PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL=true/);
  });

  it('acepta host no local con la confirmación adicional', () => {
    const configuracion = leerConfiguracionBootstrapSuperadmin(
      entornoValido({
        DATABASE_URL: 'postgresql://u:p@db.produccion.com:5432/normativo',
        PERMITIR_BOOTSTRAP_SUPERADMIN_NO_LOCAL: 'true',
      }),
    );

    expect(configuracion.baseObjetivo).toBe('db.produccion.com/normativo');
  });

  it('exige correo no vacío', () => {
    expect(() =>
      leerConfiguracionBootstrapSuperadmin(
        entornoValido({ BOOTSTRAP_SUPERADMIN_CORREO: '  ' }),
      ),
    ).toThrow(/BOOTSTRAP_SUPERADMIN_CORREO no puede estar vacío/);
  });

  it('normaliza el correo con trim y minúsculas', () => {
    const configuracion = leerConfiguracionBootstrapSuperadmin(
      entornoValido({ BOOTSTRAP_SUPERADMIN_CORREO: '  Super@Ejemplo.COM ' }),
    );

    expect(configuracion.correoNormalizado).toBe('super@ejemplo.com');
  });

  it('valida la política de contraseña', () => {
    expect(() =>
      leerConfiguracionBootstrapSuperadmin(
        entornoValido({ BOOTSTRAP_SUPERADMIN_PASSWORD: 'corta' }),
      ),
    ).toThrow(/al menos/);
  });

  it('aplica valores por defecto de id/nombre/apellido y respeta overrides', () => {
    const porDefecto = leerConfiguracionBootstrapSuperadmin(entornoValido());
    const explicito = leerConfiguracionBootstrapSuperadmin(
      entornoValido({
        BOOTSTRAP_SUPERADMIN_ID: 'superadmin-custom',
        BOOTSTRAP_SUPERADMIN_NOMBRE: 'Ana',
        BOOTSTRAP_SUPERADMIN_APELLIDO: 'Pérez',
      }),
    );

    expect(porDefecto.id).toBe('usuario-superadmin-inicial');
    expect(porDefecto.nombre).toBe('Superadministrador');
    expect(porDefecto.apellido).toBe('Inicial');
    expect(explicito.id).toBe('superadmin-custom');
    expect(explicito.nombre).toBe('Ana');
    expect(explicito.apellido).toBe('Pérez');
  });

  it('con configuración válida entrega base objetivo sin credenciales', () => {
    const configuracion = leerConfiguracionBootstrapSuperadmin(entornoValido());

    expect(configuracion.baseObjetivo).toBe('localhost/normativo');
    expect(configuracion.baseObjetivo).not.toContain('normativo:normativo@');
  });
});

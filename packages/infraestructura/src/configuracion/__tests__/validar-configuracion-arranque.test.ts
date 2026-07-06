import { describe, expect, it } from '@jest/globals';
import {
  PUERTO_POR_DEFECTO,
  validarConfiguracionArranque,
} from '../validar-configuracion-arranque';

const URL_POSTGRES_VALIDA =
  'postgresql://normativo:normativo@localhost:5432/normativo?schema=public';
const JWT_SECRET_LARGO = 'secreto-jwt-de-produccion-con-longitud-suficiente';

function entornoBase(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe('validarConfiguracionArranque', () => {
  describe('PERSISTENCIA', () => {
    it('en producción exige PERSISTENCIA explícita', () => {
      expect(() =>
        validarConfiguracionArranque(entornoBase({ NODE_ENV: 'production' })),
      ).toThrow(/PERSISTENCIA debe definirse explícitamente en producción/);
    });

    it('en producción rechaza PERSISTENCIA vacía', () => {
      expect(() =>
        validarConfiguracionArranque(
          entornoBase({ NODE_ENV: 'production', PERSISTENCIA: '  ' }),
        ),
      ).toThrow(/PERSISTENCIA debe definirse explícitamente en producción/);
    });

    it('rechaza valores desconocidos en producción', () => {
      expect(() =>
        validarConfiguracionArranque(
          entornoBase({ NODE_ENV: 'production', PERSISTENCIA: 'prsima' }),
        ),
      ).toThrow(/PERSISTENCIA tiene un valor desconocido: 'prsima'/);
    });

    it('rechaza valores desconocidos también fuera de producción', () => {
      expect(() =>
        validarConfiguracionArranque(entornoBase({ PERSISTENCIA: 'otro' })),
      ).toThrow(/PERSISTENCIA tiene un valor desconocido: 'otro'/);
    });

    it('fuera de producción cae a memoria si PERSISTENCIA está ausente', () => {
      const configuracion = validarConfiguracionArranque(entornoBase());

      expect(configuracion.persistencia).toBe('memoria');
    });

    it('acepta memoria explícita en producción', () => {
      const configuracion = validarConfiguracionArranque(
        entornoBase({
          NODE_ENV: 'production',
          PERSISTENCIA: 'memoria',
          JWT_SECRET: JWT_SECRET_LARGO,
        }),
      );

      expect(configuracion.persistencia).toBe('memoria');
    });

    it('acepta prisma explícita con DATABASE_URL válida', () => {
      const configuracion = validarConfiguracionArranque(
        entornoBase({
          NODE_ENV: 'production',
          PERSISTENCIA: 'prisma',
          DATABASE_URL: URL_POSTGRES_VALIDA,
          JWT_SECRET: JWT_SECRET_LARGO,
        }),
      );

      expect(configuracion.persistencia).toBe('prisma');
    });
  });

  describe('JWT en el arranque', () => {
    it('en producción exige JWT_SECRET', () => {
      expect(() =>
        validarConfiguracionArranque(
          entornoBase({ NODE_ENV: 'production', PERSISTENCIA: 'memoria' }),
        ),
      ).toThrow('JWT_SECRET debe estar configurado en producción');
    });

    it('fuera de producción entrega configuración jwt con secreto de desarrollo', () => {
      const configuracion = validarConfiguracionArranque(entornoBase());

      expect(configuracion.jwt.secreto.length).toBeGreaterThan(0);
    });
  });

  describe('DATABASE_URL con persistencia prisma', () => {
    it('exige DATABASE_URL presente', () => {
      expect(() =>
        validarConfiguracionArranque(entornoBase({ PERSISTENCIA: 'prisma' })),
      ).toThrow(/DATABASE_URL debe estar configurada/);
    });

    it('rechaza DATABASE_URL que no es URL', () => {
      expect(() =>
        validarConfiguracionArranque(
          entornoBase({ PERSISTENCIA: 'prisma', DATABASE_URL: 'no-es-url' }),
        ),
      ).toThrow(/DATABASE_URL debe ser una URL válida/);
    });

    it('rechaza protocolos distintos de postgresql/postgres', () => {
      expect(() =>
        validarConfiguracionArranque(
          entornoBase({
            PERSISTENCIA: 'prisma',
            DATABASE_URL: 'mysql://usuario:clave@localhost:3306/base',
          }),
        ),
      ).toThrow(/DATABASE_URL debe usar protocolo postgresql/);
    });

    it('acepta protocolo postgres:', () => {
      const configuracion = validarConfiguracionArranque(
        entornoBase({
          PERSISTENCIA: 'prisma',
          DATABASE_URL: 'postgres://normativo:normativo@localhost:5432/normativo',
        }),
      );

      expect(configuracion.persistencia).toBe('prisma');
    });

    it('no exige DATABASE_URL con persistencia memoria', () => {
      expect(() =>
        validarConfiguracionArranque(entornoBase({ PERSISTENCIA: 'memoria' })),
      ).not.toThrow();
    });
  });

  describe('PUERTO', () => {
    it('usa 3000 por defecto', () => {
      const configuracion = validarConfiguracionArranque(entornoBase());

      expect(configuracion.puerto).toBe(PUERTO_POR_DEFECTO);
    });

    it('acepta un puerto entero válido', () => {
      const configuracion = validarConfiguracionArranque(
        entornoBase({ PUERTO: '8080' }),
      );

      expect(configuracion.puerto).toBe(8080);
    });

    it.each(['abc', '0', '65536', '3000.5', '-1'])(
      "rechaza PUERTO inválido '%s'",
      (puerto) => {
        expect(() =>
          validarConfiguracionArranque(entornoBase({ PUERTO: puerto })),
        ).toThrow(/PUERTO debe ser un entero entre 1 y 65535/);
      },
    );
  });
});

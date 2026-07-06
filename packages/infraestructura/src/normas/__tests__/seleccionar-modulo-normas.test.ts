import { describe, expect, it } from '@jest/globals';
import {
  obtenerPersistenciaNormas,
  seleccionarModuloNormas,
  seleccionarModulosHttp,
} from '../seleccionar-modulo-normas';
import { NormasModule } from '../normas.module';
import { NormasPrismaModule } from '../normas-prisma.module';
import { AuthModule } from '../../autenticacion/http/auth.module';
import { AuthPrismaModule } from '../../autenticacion/http/auth-prisma.module';

describe('seleccionarModuloNormas', () => {
  it('usa memoria por defecto', () => {
    expect(obtenerPersistenciaNormas(undefined)).toBe('memoria');
    expect(seleccionarModuloNormas(undefined)).toBe(NormasModule);
  });

  it('usa memoria explícita', () => {
    expect(obtenerPersistenciaNormas('memoria')).toBe('memoria');
    expect(seleccionarModuloNormas('memoria')).toBe(NormasModule);
  });

  it('usa Prisma solo cuando PERSISTENCIA es prisma', () => {
    expect(obtenerPersistenciaNormas('prisma')).toBe('prisma');
    expect(seleccionarModuloNormas('prisma')).toBe(NormasPrismaModule);
  });

  it('lanza error ante valores desconocidos (misma semántica que el arranque)', () => {
    expect(() => obtenerPersistenciaNormas('otro')).toThrow(
      /PERSISTENCIA tiene un valor desconocido: 'otro'/,
    );
    expect(() => seleccionarModuloNormas('prsima')).toThrow(
      /PERSISTENCIA tiene un valor desconocido: 'prsima'/,
    );
    expect(() => seleccionarModulosHttp('prsima')).toThrow(
      /PERSISTENCIA tiene un valor desconocido: 'prsima'/,
    );
  });

  it('seleccionarModulosHttp entrega normas + auth acordes a la persistencia', () => {
    expect(seleccionarModulosHttp(undefined)).toEqual([NormasModule, AuthModule]);
    expect(seleccionarModulosHttp('memoria')).toEqual([NormasModule, AuthModule]);
    expect(seleccionarModulosHttp('prisma')).toEqual([
      NormasPrismaModule,
      AuthPrismaModule,
    ]);
  });
});

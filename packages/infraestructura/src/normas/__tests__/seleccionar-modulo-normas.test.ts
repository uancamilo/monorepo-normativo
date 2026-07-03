import { describe, expect, it } from '@jest/globals';
import {
  obtenerPersistenciaNormas,
  seleccionarModuloNormas,
} from '../seleccionar-modulo-normas';
import { NormasModule } from '../normas.module';
import { NormasPrismaModule } from '../normas-prisma.module';

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
  });
});

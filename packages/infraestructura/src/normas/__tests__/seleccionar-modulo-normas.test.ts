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

  it('usa Prisma solo cuando PERSISTENCIA es prisma', () => {
    expect(obtenerPersistenciaNormas('prisma')).toBe('prisma');
    expect(seleccionarModuloNormas('prisma')).toBe(NormasPrismaModule);
  });

  it('trata valores desconocidos como memoria', () => {
    expect(obtenerPersistenciaNormas('otro')).toBe('memoria');
    expect(seleccionarModuloNormas('otro')).toBe(NormasModule);
  });
});

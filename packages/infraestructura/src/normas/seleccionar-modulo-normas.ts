import { NormasModule } from './normas.module';
import { NormasPrismaModule } from './normas-prisma.module';

export type PersistenciaNormas = 'memoria' | 'prisma';

export function obtenerPersistenciaNormas(
  valor: string | undefined = process.env.PERSISTENCIA,
): PersistenciaNormas {
  return valor === 'prisma' ? 'prisma' : 'memoria';
}

export function seleccionarModuloNormas(
  valor: string | undefined = process.env.PERSISTENCIA,
) {
  return obtenerPersistenciaNormas(valor) === 'prisma'
    ? NormasPrismaModule
    : NormasModule;
}

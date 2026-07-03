import { NormasModule } from './normas.module';
import { NormasPrismaModule } from './normas-prisma.module';
import {
  obtenerPersistenciaNormas,
  PersistenciaNormas,
} from '../configuracion/persistencia';

export type { PersistenciaNormas };
export { obtenerPersistenciaNormas };

export function seleccionarModuloNormas(
  valor: string | undefined = process.env.PERSISTENCIA,
) {
  return obtenerPersistenciaNormas(valor) === 'prisma'
    ? NormasPrismaModule
    : NormasModule;
}

import { NormasModule } from './normas.module';
import { NormasPrismaModule } from './normas-prisma.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { AuthPrismaModule } from '../autenticacion/http/auth-prisma.module';
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

/**
 * Módulos HTTP de la aplicación según PERSISTENCIA: normas + auth/login,
 * ambos respaldados por el mismo tipo de adaptadores (memoria o Prisma).
 */
export function seleccionarModulosHttp(
  valor: string | undefined = process.env.PERSISTENCIA,
) {
  return obtenerPersistenciaNormas(valor) === 'prisma'
    ? [NormasPrismaModule, AuthPrismaModule]
    : [NormasModule, AuthModule];
}

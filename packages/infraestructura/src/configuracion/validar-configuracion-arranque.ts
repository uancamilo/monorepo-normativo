import {
  obtenerPersistenciaNormas,
  PersistenciaNormas,
} from './persistencia';
import { ConfiguracionJwt, obtenerConfiguracionJwt } from './jwt';
import {
  ConfiguracionIngesta,
  obtenerConfiguracionIngesta,
} from './ingesta';

export const PUERTO_POR_DEFECTO = 3000;

export interface ConfiguracionArranque {
  persistencia: PersistenciaNormas;
  puerto: number;
  jwt: ConfiguracionJwt;
  ingesta: ConfiguracionIngesta;
}

/**
 * Valida la configuración mínima de arranque a partir del entorno.
 *
 * Reglas:
 * - En producción (NODE_ENV=production) PERSISTENCIA debe ser explícita y
 *   valer exactamente 'memoria' o 'prisma'. Sin fallback silencioso.
 * - Fuera de producción, PERSISTENCIA ausente cae a 'memoria', pero un valor
 *   presente desconocido es error (evita typos como 'prsima').
 * - Con persistencia 'prisma', DATABASE_URL debe existir y ser una URL
 *   postgresql/postgres válida.
 * - PUERTO es opcional (default 3000); si viene debe ser entero entre 1 y 65535.
 */
export function validarConfiguracionArranque(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionArranque {
  const persistencia = validarPersistencia(entorno);

  if (persistencia === 'prisma') {
    validarDatabaseUrl(entorno.DATABASE_URL);
  }

  return {
    persistencia,
    puerto: validarPuerto(entorno.PUERTO),
    jwt: obtenerConfiguracionJwt(entorno),
    ingesta: obtenerConfiguracionIngesta(entorno),
  };
}

function validarPersistencia(entorno: NodeJS.ProcessEnv): PersistenciaNormas {
  const valor = entorno.PERSISTENCIA;
  const esProduccion = entorno.NODE_ENV === 'production';

  if (esProduccion && (valor === undefined || valor.trim().length === 0)) {
    throw new Error(
      'PERSISTENCIA debe definirse explícitamente en producción (memoria o prisma)',
    );
  }

  // Semántica única compartida con seleccionarModuloNormas: ausente -> memoria,
  // valor desconocido -> error.
  return obtenerPersistenciaNormas(valor);
}

function validarDatabaseUrl(valor: string | undefined): void {
  if (valor === undefined || valor.trim().length === 0) {
    throw new Error(
      'DATABASE_URL debe estar configurada cuando PERSISTENCIA es prisma',
    );
  }

  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('DATABASE_URL debe ser una URL válida');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL debe usar protocolo postgresql');
  }
}

function validarPuerto(valor: string | undefined): number {
  if (valor === undefined || valor.trim().length === 0) {
    return PUERTO_POR_DEFECTO;
  }

  const puerto = Number(valor);

  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(
      `PUERTO debe ser un entero entre 1 y 65535 (valor recibido: '${valor}')`,
    );
  }

  return puerto;
}

export const LONGITUD_MINIMA_JWT_SECRET = 32;

/**
 * Secreto explícito de desarrollo/test. Nunca válido en producción: allí
 * JWT_SECRET es obligatorio (ver validarConfiguracionArranque).
 */
export const JWT_SECRET_DESARROLLO =
  'secreto-jwt-solo-desarrollo-no-usar-en-produccion';

export interface ConfiguracionJwt {
  secreto: string;
  emisor?: string;
  audiencia?: string;
}

/**
 * Resuelve la configuración JWT desde el entorno.
 *
 * Reglas:
 * - En producción (NODE_ENV=production) JWT_SECRET es obligatorio y debe tener
 *   al menos 32 caracteres (HS256 con secreto corto es inseguro).
 * - Fuera de producción, JWT_SECRET ausente cae al secreto explícito de
 *   desarrollo, pensado para arranque local y tests.
 * - JWT_ISSUER y JWT_AUDIENCE son opcionales; si están, el verificador los exige.
 */
export function obtenerConfiguracionJwt(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionJwt {
  const esProduccion = entorno.NODE_ENV === 'production';
  const secreto = entorno.JWT_SECRET;

  if (secreto === undefined || secreto.trim().length === 0) {
    if (esProduccion) {
      throw new Error('JWT_SECRET debe estar configurado en producción');
    }

    return {
      secreto: JWT_SECRET_DESARROLLO,
      emisor: normalizarOpcional(entorno.JWT_ISSUER),
      audiencia: normalizarOpcional(entorno.JWT_AUDIENCE),
    };
  }

  if (esProduccion && secreto.length < LONGITUD_MINIMA_JWT_SECRET) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_JWT_SECRET} caracteres en producción`,
    );
  }

  return {
    secreto,
    emisor: normalizarOpcional(entorno.JWT_ISSUER),
    audiencia: normalizarOpcional(entorno.JWT_AUDIENCE),
  };
}

function normalizarOpcional(valor: string | undefined): string | undefined {
  if (valor === undefined || valor.trim().length === 0) {
    return undefined;
  }
  return valor;
}

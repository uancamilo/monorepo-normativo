import { jwtVerify, SignJWT } from 'jose';
import { UsuarioAutenticado } from './usuario-autenticado';
import { ErrorTokenInvalido } from './errores-autenticacion';

export interface OpcionesServicioTokens {
  secreto: string;
  emisor?: string;
  audiencia?: string;
}

export const DURACION_TOKEN_SEGUNDOS_POR_DEFECTO = 60 * 60;

/**
 * Firma y verifica JWT HS256 mínimos. El token solo identifica al usuario
 * (claim `sub`); el claim `rol` es informativo y las reglas de negocio nunca
 * deben confiar en él (los casos de uso cargan el Usuario del repositorio).
 */
export class ServicioTokens {
  private readonly clave: Uint8Array;

  constructor(private readonly opciones: OpcionesServicioTokens) {
    if (opciones.secreto.trim().length === 0) {
      throw new Error('El secreto del servicio de tokens no puede estar vacío');
    }
    this.clave = new TextEncoder().encode(opciones.secreto);
  }

  async firmar(datos: {
    usuarioId: string;
    rol?: string;
    duracionSegundos?: number;
  }): Promise<string> {
    if (datos.usuarioId.trim().length === 0) {
      throw new Error('usuarioId no puede estar vacío para firmar un token');
    }

    const ahoraSegundos = Math.floor(Date.now() / 1000);
    const duracion =
      datos.duracionSegundos ?? DURACION_TOKEN_SEGUNDOS_POR_DEFECTO;

    let token = new SignJWT(datos.rol === undefined ? {} : { rol: datos.rol })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(datos.usuarioId)
      .setIssuedAt(ahoraSegundos)
      .setExpirationTime(ahoraSegundos + duracion);

    if (this.opciones.emisor !== undefined) {
      token = token.setIssuer(this.opciones.emisor);
    }
    if (this.opciones.audiencia !== undefined) {
      token = token.setAudience(this.opciones.audiencia);
    }

    return token.sign(this.clave);
  }

  async verificar(token: string): Promise<UsuarioAutenticado> {
    let sub: string | undefined;
    let rol: unknown;

    try {
      const { payload } = await jwtVerify(token, this.clave, {
        algorithms: ['HS256'],
        issuer: this.opciones.emisor,
        audience: this.opciones.audiencia,
      });
      sub = payload.sub;
      rol = payload.rol;
    } catch {
      throw new ErrorTokenInvalido();
    }

    if (typeof sub !== 'string' || sub.trim().length === 0) {
      throw new ErrorTokenInvalido();
    }

    return typeof rol === 'string' ? { id: sub, rol } : { id: sub };
  }
}

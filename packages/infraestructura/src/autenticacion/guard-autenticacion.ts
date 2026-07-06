import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ServicioTokens } from './servicio-tokens';
import { UsuarioAutenticado } from './usuario-autenticado';

export interface SolicitudConUsuarioAutenticado {
  headers?: Record<string, string | string[] | undefined>;
  usuarioAutenticado?: UsuarioAutenticado;
}

@Injectable()
export class GuardAutenticacion implements CanActivate {
  constructor(private readonly servicioTokens: ServicioTokens) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const solicitud = contexto
      .switchToHttp()
      .getRequest<SolicitudConUsuarioAutenticado>();

    const token = extraerTokenBearer(solicitud.headers?.authorization);
    if (token === undefined) {
      throw new UnauthorizedException(
        'Se requiere un token Bearer en el header Authorization',
      );
    }

    try {
      solicitud.usuarioAutenticado = await this.servicioTokens.verificar(token);
    } catch {
      throw new UnauthorizedException('Token de autenticación inválido');
    }

    return true;
  }
}

function extraerTokenBearer(
  encabezado: string | string[] | undefined,
): string | undefined {
  if (typeof encabezado !== 'string') {
    return undefined;
  }

  const partes = encabezado.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0].toLowerCase() !== 'bearer') {
    return undefined;
  }

  return partes[1];
}

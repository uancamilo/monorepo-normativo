import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UsuarioAutenticado } from './usuario-autenticado';
import { SolicitudConUsuarioAutenticado } from './guard-autenticacion';

/**
 * Entrega al controller el usuario autenticado que dejó GuardAutenticacion en
 * la request. Solo tiene sentido en rutas protegidas por ese guard.
 */
export const UsuarioActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const solicitud = contexto
      .switchToHttp()
      .getRequest<SolicitudConUsuarioAutenticado>();

    if (solicitud.usuarioAutenticado === undefined) {
      throw new Error(
        'UsuarioActual requiere una ruta protegida por GuardAutenticacion',
      );
    }

    return solicitud.usuarioAutenticado;
  },
);

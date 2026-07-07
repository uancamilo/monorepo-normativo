import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Mensaje único para toda denegación de negocio (falta de permiso editorial,
 * suscripción ausente/inactiva o norma no publicada): el cuerpo HTTP no debe
 * revelar la causa concreta de un 403 (ADR 0004).
 */
export const MENSAJE_ACCESO_DENEGADO = 'Acceso denegado';

/**
 * Traduce razones de fallo de los casos de uso a excepciones HTTP de NestJS.
 * Pertenece solo a infraestructura: los casos de uso no lanzan excepciones HTTP.
 */
export function razonAExcepcionHttp(razon: string): HttpException {
  switch (razon) {
    case 'SOLICITUD_INVALIDA':
      return new BadRequestException(razon);
    case 'USUARIO_NO_ENCONTRADO':
      return new UnauthorizedException(razon);
    case 'ACCESO_DENEGADO':
    case 'SUSCRIPCION_NO_ENCONTRADA':
      return new ForbiddenException(MENSAJE_ACCESO_DENEGADO);
    case 'NORMA_NO_ENCONTRADA':
      return new NotFoundException(razon);
    case 'NORMA_YA_PUBLICADA':
    case 'CORREO_YA_REGISTRADO':
      return new ConflictException(razon);
    case 'ROL_NO_PERMITIDO':
    case 'CONTRASENA_INVALIDA':
      return new BadRequestException(razon);
    default:
      return new BadRequestException(razon);
  }
}

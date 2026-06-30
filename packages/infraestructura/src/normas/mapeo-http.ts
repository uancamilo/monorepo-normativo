import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

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
      return new ForbiddenException(razon);
    case 'SUSCRIPCION_NO_ENCONTRADA':
      return new ForbiddenException(razon);
    case 'NORMA_NO_ENCONTRADA':
      return new NotFoundException(razon);
    case 'NORMA_YA_PUBLICADA':
      return new ConflictException(razon);
    default:
      return new BadRequestException(razon);
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
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
    case 'URL_INVALIDA':
      return new BadRequestException(razon);
    case 'LIMITE_ENTRADAS_INGESTA_EXCEDIDO':
      return new PayloadTooLargeException(razon);
    case 'USUARIO_NO_ENCONTRADO':
      return new UnauthorizedException(razon);
    case 'ACCESO_DENEGADO':
    case 'SUSCRIPCION_NO_ENCONTRADA':
      return new ForbiddenException(MENSAJE_ACCESO_DENEGADO);
    case 'NORMA_NO_ENCONTRADA':
    case 'LOTE_NO_ENCONTRADO':
    case 'EDICION_NO_ENCONTRADA':
      return new NotFoundException(razon);
    case 'NORMA_YA_PUBLICADA':
    case 'NORMA_NO_EDITABLE':
    case 'CORREO_YA_REGISTRADO':
    case 'EDICION_YA_EXISTE':
    case 'EJECUCION_INGESTA_CONFLICTIVA':
    // El estado editorial cambió entre la lectura y la persistencia: mismo
    // tratamiento 409 que el resto de conflictos de estado.
    case 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE':
    // Una modificación concurrente invalidó las precondiciones de publicación
    // (obligatorio vaciado o edición sin fuente publicable): el cliente debe
    // releer la norma y reintentar.
    case 'NORMA_MODIFICADA_CONCURRENTEMENTE':
      return new ConflictException(razon);
    case 'CATALOGO_NO_DISPONIBLE':
      return new ServiceUnavailableException(razon);
    // Requisitos de publicación incompletos: el estado de la norma (o de la
    // fuente de su edición del Registro Oficial) impide publicarla, misma
    // familia 409 que NORMA_YA_PUBLICADA.
    case 'TIPO_NORMA_REQUERIDO':
    case 'TITULO_REQUERIDO':
    case 'INSTITUCION_EXPIDE_REQUERIDA':
    case 'ESTADO_JURIDICO_REQUERIDO':
    case 'EDICION_REGISTRO_OFICIAL_REQUERIDA':
    case 'FUENTE_REQUERIDA':
      return new ConflictException(razon);
    case 'ROL_NO_PERMITIDO':
    case 'CONTRASENA_INVALIDA':
      return new BadRequestException(razon);
    default:
      return new BadRequestException(razon);
  }
}

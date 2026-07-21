import { describe, expect, it } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MENSAJE_ACCESO_DENEGADO, razonAExcepcionHttp } from '../mapeo-http';

/**
 * Frontera autenticación/autorización: HTTP solo traduce las razones que
 * deciden aplicación/dominio. 401 = identidad (usuario del token no existe);
 * 403 = falta de permiso de negocio o de acceso por suscripción/publicación.
 */
describe('razonAExcepcionHttp', () => {
  it.each([
    ['SOLICITUD_INVALIDA', BadRequestException],
    ['URL_INVALIDA', BadRequestException],
    ['LIMITE_ENTRADAS_INGESTA_EXCEDIDO', PayloadTooLargeException],
    ['USUARIO_NO_ENCONTRADO', UnauthorizedException],
    ['ACCESO_DENEGADO', ForbiddenException],
    ['SUSCRIPCION_NO_ENCONTRADA', ForbiddenException],
    ['NORMA_NO_ENCONTRADA', NotFoundException],
    ['LOTE_NO_ENCONTRADO', NotFoundException],
    ['NORMA_YA_PUBLICADA', ConflictException],
    ['NORMA_MODIFICADA_CONCURRENTEMENTE', ConflictException],
    ['TIPO_NORMA_REQUERIDO', ConflictException],
    ['TITULO_REQUERIDO', ConflictException],
    ['INSTITUCION_EXPIDE_REQUERIDA', ConflictException],
    ['ESTADO_JURIDICO_REQUERIDO', ConflictException],
    ['EDICION_REGISTRO_OFICIAL_REQUERIDA', ConflictException],
    ['FUENTE_REQUERIDA', ConflictException],
    ['CORREO_YA_REGISTRADO', ConflictException],
    ['EDICION_YA_EXISTE', ConflictException],
    ['EJECUCION_INGESTA_CONFLICTIVA', ConflictException],
    ['ESTADO_EDITORIAL_CAMBIO_CONCURRENTE', ConflictException],
    ['CATALOGO_NO_DISPONIBLE', ServiceUnavailableException],
    ['ROL_NO_PERMITIDO', BadRequestException],
    ['CONTRASENA_INVALIDA', BadRequestException],
  ])('traduce %s', (razon, excepcionEsperada) => {
    expect(razonAExcepcionHttp(razon)).toBeInstanceOf(excepcionEsperada);
  });

  it('las denegaciones de negocio colapsan al mismo 403 con cuerpo genérico idéntico', () => {
    const porPermiso = razonAExcepcionHttp('ACCESO_DENEGADO');
    const porSuscripcion = razonAExcepcionHttp('SUSCRIPCION_NO_ENCONTRADA');

    expect(porPermiso.getStatus()).toBe(403);
    expect(porSuscripcion.getStatus()).toBe(403);
    // El cuerpo no revela la causa: mensaje genérico y respuesta idéntica
    // para falta de permiso editorial y para suscripción ausente/inactiva.
    expect(porPermiso.message).toBe(MENSAJE_ACCESO_DENEGADO);
    expect(porPermiso.getResponse()).toEqual(porSuscripcion.getResponse());
    expect(JSON.stringify(porPermiso.getResponse())).not.toContain(
      'SUSCRIPCION',
    );
  });

  it('el conflicto concurrente responde 409 sin exponer detalles internos', () => {
    const excepcion = razonAExcepcionHttp('NORMA_MODIFICADA_CONCURRENTEMENTE');

    expect(excepcion.getStatus()).toBe(409);
    // El cuerpo solo lleva la razón tipada: nada de Prisma ni internals.
    const cuerpo = JSON.stringify(excepcion.getResponse());
    expect(cuerpo).toContain('NORMA_MODIFICADA_CONCURRENTEMENTE');
    expect(cuerpo.toLowerCase()).not.toContain('prisma');
  });

  it('una razón desconocida cae a 400 y no filtra detalles', () => {
    const excepcion = razonAExcepcionHttp('RAZON_FUTURA_DESCONOCIDA');

    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect(excepcion.getStatus()).toBe(400);
  });

  it.each([
    'TIPO_NORMA_REQUERIDO',
    'TITULO_REQUERIDO',
    'INSTITUCION_EXPIDE_REQUERIDA',
    'ESTADO_JURIDICO_REQUERIDO',
    'EDICION_REGISTRO_OFICIAL_REQUERIDA',
    'FUENTE_REQUERIDA',
  ])('responde 409 para publicación incompleta: %s', (razon) => {
    expect(razonAExcepcionHttp(razon).getStatus()).toBe(409);
  });
});

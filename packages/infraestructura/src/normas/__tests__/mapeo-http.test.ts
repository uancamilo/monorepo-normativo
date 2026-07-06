import { describe, expect, it } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
    ['USUARIO_NO_ENCONTRADO', UnauthorizedException],
    ['ACCESO_DENEGADO', ForbiddenException],
    ['SUSCRIPCION_NO_ENCONTRADA', ForbiddenException],
    ['NORMA_NO_ENCONTRADA', NotFoundException],
    ['NORMA_YA_PUBLICADA', ConflictException],
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

  it('una razón desconocida cae a 400 y no filtra detalles', () => {
    const excepcion = razonAExcepcionHttp('RAZON_FUTURA_DESCONOCIDA');

    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect(excepcion.getStatus()).toBe(400);
  });
});

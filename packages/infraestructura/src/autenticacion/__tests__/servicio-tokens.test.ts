import { describe, expect, it } from '@jest/globals';
import { SignJWT } from 'jose';
import { ServicioTokens } from '../servicio-tokens';
import { ErrorTokenInvalido } from '../errores-autenticacion';

const SECRETO = 'secreto-de-prueba-suficientemente-largo-para-hs256';
const OTRO_SECRETO = 'otro-secreto-distinto-tambien-largo-para-hs256';

function crearServicio(opciones: { emisor?: string; audiencia?: string } = {}) {
  return new ServicioTokens({ secreto: SECRETO, ...opciones });
}

describe('ServicioTokens', () => {
  it('firma y verifica un token válido con sub y rol informativo', async () => {
    const servicio = crearServicio();

    const token = await servicio.firmar({ usuarioId: 'usuario-1', rol: 'EDITOR' });
    const usuario = await servicio.verificar(token);

    expect(usuario).toEqual({ id: 'usuario-1', rol: 'EDITOR' });
  });

  it('verifica token sin rol y retorna solo el id', async () => {
    const servicio = crearServicio();

    const token = await servicio.firmar({ usuarioId: 'usuario-2' });
    const usuario = await servicio.verificar(token);

    expect(usuario).toEqual({ id: 'usuario-2' });
  });

  it('rechaza token mal formado', async () => {
    const servicio = crearServicio();

    await expect(servicio.verificar('no-es-un-jwt')).rejects.toBeInstanceOf(
      ErrorTokenInvalido,
    );
  });

  it('rechaza token con firma inválida (otro secreto)', async () => {
    const servicioAjeno = new ServicioTokens({ secreto: OTRO_SECRETO });
    const token = await servicioAjeno.firmar({ usuarioId: 'usuario-1' });

    await expect(crearServicio().verificar(token)).rejects.toBeInstanceOf(
      ErrorTokenInvalido,
    );
  });

  it('rechaza token expirado', async () => {
    const servicio = crearServicio();
    const token = await servicio.firmar({
      usuarioId: 'usuario-1',
      duracionSegundos: -60,
    });

    await expect(servicio.verificar(token)).rejects.toBeInstanceOf(
      ErrorTokenInvalido,
    );
  });

  it('rechaza token sin sub', async () => {
    const clave = new TextEncoder().encode(SECRETO);
    const ahora = Math.floor(Date.now() / 1000);
    const tokenSinSub = await new SignJWT({ rol: 'EDITOR' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(ahora)
      .setExpirationTime(ahora + 60)
      .sign(clave);

    await expect(crearServicio().verificar(tokenSinSub)).rejects.toBeInstanceOf(
      ErrorTokenInvalido,
    );
  });

  it('exige emisor y audiencia cuando están configurados', async () => {
    const servicioCompleto = crearServicio({
      emisor: 'normativo',
      audiencia: 'api-normativo',
    });
    const servicioSinClaims = crearServicio();

    const tokenCompleto = await servicioCompleto.firmar({ usuarioId: 'usuario-1' });
    const tokenSinClaims = await servicioSinClaims.firmar({ usuarioId: 'usuario-1' });

    await expect(servicioCompleto.verificar(tokenCompleto)).resolves.toEqual({
      id: 'usuario-1',
    });
    await expect(
      servicioCompleto.verificar(tokenSinClaims),
    ).rejects.toBeInstanceOf(ErrorTokenInvalido);
  });

  it('rechaza construir el servicio con secreto vacío', () => {
    expect(() => new ServicioTokens({ secreto: '  ' })).toThrow(
      'El secreto del servicio de tokens no puede estar vacío',
    );
  });

  it('rechaza firmar con usuarioId vacío', async () => {
    await expect(crearServicio().firmar({ usuarioId: ' ' })).rejects.toThrow(
      'usuarioId no puede estar vacío para firmar un token',
    );
  });
});

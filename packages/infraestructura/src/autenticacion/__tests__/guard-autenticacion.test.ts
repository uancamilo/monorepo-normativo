import { describe, expect, it } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  GuardAutenticacion,
  SolicitudConUsuarioAutenticado,
} from '../guard-autenticacion';
import { ServicioTokens } from '../servicio-tokens';

const SECRETO = 'secreto-de-prueba-suficientemente-largo-para-hs256';

function crearContexto(solicitud: SolicitudConUsuarioAutenticado) {
  return {
    switchToHttp: () => ({
      getRequest: () => solicitud,
    }),
  } as unknown as ExecutionContext;
}

describe('GuardAutenticacion', () => {
  const servicioTokens = new ServicioTokens({ secreto: SECRETO });
  const guard = new GuardAutenticacion(servicioTokens);

  it('rechaza solicitud sin header Authorization con 401', async () => {
    await expect(
      guard.canActivate(crearContexto({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza Authorization sin esquema Bearer con 401', async () => {
    await expect(
      guard.canActivate(
        crearContexto({ headers: { authorization: 'Basic abc123' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza Bearer sin token con 401', async () => {
    await expect(
      guard.canActivate(crearContexto({ headers: { authorization: 'Bearer' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza Bearer con token inválido con 401', async () => {
    await expect(
      guard.canActivate(
        crearContexto({ headers: { authorization: 'Bearer token-invalido' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('con Bearer válido deja el usuario autenticado en la request', async () => {
    const token = await servicioTokens.firmar({
      usuarioId: 'usuario-1',
      rol: 'EDITOR',
    });
    const solicitud: SolicitudConUsuarioAutenticado = {
      headers: { authorization: `Bearer ${token}` },
    };

    const resultado = await guard.canActivate(crearContexto(solicitud));

    expect(resultado).toBe(true);
    expect(solicitud.usuarioAutenticado).toEqual({
      id: 'usuario-1',
      rol: 'EDITOR',
    });
  });

  it('acepta el esquema bearer sin distinguir mayúsculas', async () => {
    const token = await servicioTokens.firmar({ usuarioId: 'usuario-1' });
    const solicitud: SolicitudConUsuarioAutenticado = {
      headers: { authorization: `bearer ${token}` },
    };

    await expect(guard.canActivate(crearContexto(solicitud))).resolves.toBe(true);
    expect(solicitud.usuarioAutenticado).toEqual({ id: 'usuario-1' });
  });
});

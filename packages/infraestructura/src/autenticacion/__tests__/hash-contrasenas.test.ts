import { describe, expect, it } from '@jest/globals';
import { ServicioHashContrasenas } from '../hash-contrasenas';

describe('ServicioHashContrasenas', () => {
  const servicio = new ServicioHashContrasenas();

  it('genera hashes distintos para la misma contraseña (salt aleatoria)', async () => {
    const primero = await servicio.generar('Password123!');
    const segundo = await servicio.generar('Password123!');

    expect(primero).not.toBe(segundo);
    expect(primero.startsWith('scrypt:v1:')).toBe(true);
    expect(segundo.startsWith('scrypt:v1:')).toBe(true);
  });

  it('verifica la contraseña correcta', async () => {
    const hash = await servicio.generar('Password123!');

    await expect(servicio.verificar('Password123!', hash)).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await servicio.generar('Password123!');

    await expect(servicio.verificar('otra-clave', hash)).resolves.toBe(false);
  });

  it.each([
    'no-es-un-hash',
    'scrypt:v2:c2FsdA==:aGFzaA==',
    'scrypt:v1:!!!:###',
    'scrypt:v1::',
    '',
  ])("devuelve false ante hash inválido '%s' sin lanzar", async (hashInvalido) => {
    await expect(
      servicio.verificar('Password123!', hashInvalido),
    ).resolves.toBe(false);
  });

  it('devuelve false al verificar contraseña vacía', async () => {
    const hash = await servicio.generar('Password123!');

    await expect(servicio.verificar('', hash)).resolves.toBe(false);
  });

  it('rechaza generar hash con contraseña vacía', async () => {
    await expect(servicio.generar('')).rejects.toThrow(
      'La contraseña no puede estar vacía para generar un hash',
    );
  });
});

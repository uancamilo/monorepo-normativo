import { describe, expect, it } from '@jest/globals';
import { EstadoSuscripcion } from '../../suscripciones/enums/EstadoSuscripcion';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { RolUsuario } from '../enums/RolUsuario';
import { Usuario } from '../entidades/Usuario';
import { PoliticaAccesoServicio } from '../politicas/PoliticaAccesoServicio';

const FECHA_REFERENCIA = new Date('2026-07-22T00:00:00.000Z');

describe('PoliticaAccesoServicio', () => {
  const politica = new PoliticaAccesoServicio();

  it.each([
    RolUsuario.SUPERADMINISTRADOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.EDITOR,
  ])('%s es usuario interno y accede sin suscripción', (rol) => {
    const usuario = crearUsuario(rol);

    expect(politica.esUsuarioInterno(usuario)).toBe(true);
    expect(politica.requiereSuscripcion(usuario)).toBe(false);
    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion: null,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(true);
  });

  it('SUSCRIPTOR accede cuando pertenece a una cuenta con suscripción activa y vigente', () => {
    const usuario = crearUsuario(RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion(usuario.obtenerCorreo());

    expect(politica.esUsuarioInterno(usuario)).toBe(false);
    expect(politica.requiereSuscripcion(usuario)).toBe(true);
    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(true);
  });

  it('SUSCRIPTOR sin cuenta/suscripción no accede', () => {
    const usuario = crearUsuario(RolUsuario.SUSCRIPTOR);

    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion: null,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(false);
  });

  it('SUSCRIPTOR no accede si la cuenta no habilita su correo', () => {
    const usuario = crearUsuario(RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('otro@test.com');

    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(false);
  });

  it.each([
    EstadoSuscripcion.INACTIVA,
    EstadoSuscripcion.VENCIDA,
    EstadoSuscripcion.CANCELADA,
  ])('SUSCRIPTOR no accede con suscripción %s', (estado) => {
    const usuario = crearUsuario(RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion(usuario.obtenerCorreo(), estado);

    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(false);
  });

  it('SUSCRIPTOR no accede fuera de la vigencia contractual', () => {
    const usuario = crearUsuario(RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion(
      usuario.obtenerCorreo(),
      EstadoSuscripcion.ACTIVA,
      new Date('2027-01-01T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    );

    expect(
      politica.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: FECHA_REFERENCIA,
      }),
    ).toBe(false);
  });
});

function crearUsuario(rol: RolUsuario): Usuario {
  return new Usuario({
    id: `usuario-${rol}`,
    nombre: 'Usuario',
    apellido: 'Prueba',
    correo: `${rol.toLowerCase()}@test.com`,
    rol,
  });
}

function crearSuscripcion(
  correoHabilitado: string,
  estado = EstadoSuscripcion.ACTIVA,
  fechaInicio = new Date('2026-01-01T00:00:00.000Z'),
  fechaFin = new Date('2027-01-01T00:00:00.000Z'),
): Suscripcion {
  return new Suscripcion({
    id: 'suscripcion-1',
    clienteId: 'cuenta-cliente-1',
    correosUsuariosHabilitados: [correoHabilitado],
    cantidadMaximaUsuarios: 1,
    estado,
    fechaInicio,
    fechaFin,
  });
}

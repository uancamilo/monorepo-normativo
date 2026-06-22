import { describe, it, expect } from '@jest/globals';
import { PoliticaAccesoNormaSuscriptor } from '../politicas/PoliticaAccesoNormaSuscriptor';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { EstadoSuscripcion } from '../../suscripciones/enums/EstadoSuscripcion';
import { EstadoNorma } from '../enums/EstadoNorma';

function crearUsuario(id: string, rol: RolUsuario, correo = `${id}@test.com`): Usuario {
  return new Usuario({
    id,
    nombre: `Usuario ${id}`,
    correo,
    rol,
  });
}

interface OpcionesSuscripcion {
  correoHabilitado: string;
  estado?: EstadoSuscripcion;
  fechaInicio?: Date;
  fechaFin?: Date;
}

function crearSuscripcion(id: string, opciones: OpcionesSuscripcion): Suscripcion {
  return new Suscripcion({
    id,
    clienteId: `cliente-${id}`,
    correosUsuariosHabilitados: [opciones.correoHabilitado],
    cantidadMaximaUsuarios: 1,
    estado: opciones.estado ?? EstadoSuscripcion.ACTIVA,
    fechaInicio: opciones.fechaInicio ?? new Date('2025-01-01'),
    fechaFin: opciones.fechaFin ?? new Date('2030-01-01'),
  });
}

function crearNormaPublicada(id: string): Norma {
  return new Norma({
    id,
    titulo: `Norma ${id}`,
    contenido: `Contenido de la norma ${id}`,
    estado: EstadoNorma.PUBLICADA,
    fechaPublicacion: new Date('2025-06-01'),
  });
}

function crearNormaBorrador(id: string): Norma {
  return new Norma({
    id,
    titulo: `Norma ${id}`,
    contenido: `Contenido del borrador ${id}`,
    estado: EstadoNorma.BORRADOR,
    fechaPublicacion: null,
  });
}

describe('PoliticaAccesoNormaSuscriptor', () => {
  const politica = new PoliticaAccesoNormaSuscriptor();
  const fechaReferencia = new Date('2025-06-01');

  it('permite acceso cuando el SUSCRIPTOR está habilitado por correo en una suscripción activa', () => {
    const usuario = crearUsuario('u-1', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-1', {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNormaPublicada('n-1');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(true);
  });

  it('permite acceso si los correos difieren por mayúsculas y espacios', () => {
    const usuario = crearUsuario('u-2', RolUsuario.SUSCRIPTOR, '  Usuario@Test.COM  ');
    const suscripcion = crearSuscripcion('s-2', {
      correoHabilitado: '  USUARIO@test.com  ',
    });
    const norma = crearNormaPublicada('n-2');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(true);
  });

  it('deniega acceso cuando el usuario no está habilitado en la suscripción', () => {
    const usuario = crearUsuario('u-3', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-3', {
      correoHabilitado: 'otro@test.com',
    });
    const norma = crearNormaPublicada('n-3');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso cuando la suscripción tiene fechaInicio futura', () => {
    const usuario = crearUsuario('u-4', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-4', {
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2030-01-01'),
    });
    const norma = crearNormaPublicada('n-4');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso cuando la suscripción no está ACTIVA', () => {
    const usuario = crearUsuario('u-5', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-5', {
      correoHabilitado: usuario.obtenerCorreo(),
      estado: EstadoSuscripcion.VENCIDA,
    });
    const norma = crearNormaPublicada('n-5');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso cuando la suscripción está vencida por fecha', () => {
    const usuario = crearUsuario('u-6', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-6', {
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2024-01-01'),
      fechaFin: new Date('2025-01-01'),
    });
    const norma = crearNormaPublicada('n-6');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso cuando la norma no está publicada', () => {
    const usuario = crearUsuario('u-7', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-7', {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNormaBorrador('n-7');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it.each([
    RolUsuario.SUPERADMINISTRADOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.EDITOR,
  ])('deniega acceso explícitamente al rol %s', (rol) => {
    const usuario = crearUsuario(`u-${rol}`, rol);
    const suscripcion = crearSuscripcion(`s-${rol}`, {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNormaPublicada(`n-${rol}`);

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });
});

import { describe, it, expect } from '@jest/globals';
import { PoliticaAccesoNormaSuscriptor } from '../politicas/PoliticaAccesoNormaSuscriptor';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { EstadoSuscripcion } from '../../suscripciones/enums/EstadoSuscripcion';
import { EstadoNorma } from '../enums/EstadoNorma';

function crearUsuarioSuscriptor(id: string): Usuario {
  return new Usuario({
    id,
    nombre: 'Usuario ' + id,
    correo: id + '@test.com',
    rol: RolUsuario.SUSCRIPTOR,
  });
}

function crearUsuarioSuperAdministrador(id: string): Usuario {
  return new Usuario({
    id,
    nombre: 'SuperAdmin ' + id,
    correo: id + '@superadmin.test.com',
    rol: RolUsuario.SUPERADMINISTRADOR,
  });
}

function crearUsuarioAdministrador(id: string): Usuario {
  return new Usuario({
    id,
    nombre: 'Admin ' + id,
    correo: id + '@admin.test.com',
    rol: RolUsuario.ADMINISTRADOR,
  });
}

function crearUsuarioEditor(id: string): Usuario {
  return new Usuario({
    id,
    nombre: 'Editor ' + id,
    correo: id + '@editor.test.com',
    rol: RolUsuario.EDITOR,
  });
}

function crearSuscripcionActiva(id: string, usuarioId: string, fechaFin?: Date): Suscripcion {
  return new Suscripcion({
    id,
    usuarioId,
    estado: EstadoSuscripcion.ACTIVA,
    fechaInicio: new Date('2025-01-01'),
    fechaFin: fechaFin ?? new Date('2030-01-01'),
  });
}

function crearSuscripcionVencida(id: string, usuarioId: string): Suscripcion {
  return new Suscripcion({
    id,
    usuarioId,
    estado: EstadoSuscripcion.VENCIDA,
    fechaInicio: new Date('2024-01-01'),
    fechaFin: new Date('2025-01-01'),
  });
}

function crearSuscripcionActivaVencidaPorFecha(id: string, usuarioId: string): Suscripcion {
  return new Suscripcion({
    id,
    usuarioId,
    estado: EstadoSuscripcion.ACTIVA,
    fechaInicio: new Date('2024-01-01'),
    fechaFin: new Date('2024-06-30'),
  });
}

function crearNormaPublicada(id: string): Norma {
  return new Norma({
    id,
    titulo: 'Norma ' + id,
    contenido: 'Contenido de la norma ' + id,
    estado: EstadoNorma.PUBLICADA,
    fechaPublicacion: new Date('2025-06-01'),
  });
}

function crearNormaBorrador(id: string): Norma {
  return new Norma({
    id,
    titulo: 'Norma ' + id,
    contenido: 'Contenido del borrador ' + id,
    estado: EstadoNorma.BORRADOR,
    fechaPublicacion: null,
  });
}

describe('PoliticaAccesoNormaSuscriptor', () => {
  const politica = new PoliticaAccesoNormaSuscriptor();

  it('permite acceso a una norma publicada cuando el usuario tiene suscripción activa', () => {
    const usuario = crearUsuarioSuscriptor('u-1');
    const suscripcion = crearSuscripcionActiva('s-1', usuario.obtenerId());
    const norma = crearNormaPublicada('n-1');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(true);
  });

  it('deniega acceso cuando la suscripción no está activa', () => {
    const usuario = crearUsuarioSuscriptor('u-2');
    const suscripcion = crearSuscripcionVencida('s-2', usuario.obtenerId());
    const norma = crearNormaPublicada('n-2');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando la norma no está publicada', () => {
    const usuario = crearUsuarioSuscriptor('u-3');
    const suscripcion = crearSuscripcionActiva('s-3', usuario.obtenerId());
    const norma = crearNormaBorrador('n-3');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando la suscripción activa pertenece a otro usuario', () => {
    const usuario = crearUsuarioSuscriptor('u-4');
    const suscripcion = crearSuscripcionActiva('s-4', 'otro-usuario-id');
    const norma = crearNormaPublicada('n-4');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando la suscripción está activa por estado pero vencida por fecha', () => {
    const usuario = crearUsuarioSuscriptor('u-5');
    const suscripcion = crearSuscripcionActivaVencidaPorFecha('s-5', usuario.obtenerId());
    const norma = crearNormaPublicada('n-5');
    const fechaReferencia = new Date('2025-01-01');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando el usuario tiene rol SUPERADMINISTRADOR', () => {
    const usuario = crearUsuarioSuperAdministrador('u-6');
    const suscripcion = crearSuscripcionActiva('s-6', usuario.obtenerId());
    const norma = crearNormaPublicada('n-6');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando el usuario tiene rol ADMINISTRADOR', () => {
    const usuario = crearUsuarioAdministrador('u-7');
    const suscripcion = crearSuscripcionActiva('s-7', usuario.obtenerId());
    const norma = crearNormaPublicada('n-7');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });

  it('deniega acceso cuando el usuario tiene rol EDITOR', () => {
    const usuario = crearUsuarioEditor('u-8');
    const suscripcion = crearSuscripcionActiva('s-8', usuario.obtenerId());
    const norma = crearNormaPublicada('n-8');

    const resultado = politica.puedeAcceder({ usuario, suscripcion, norma });

    expect(resultado).toBe(false);
  });
});

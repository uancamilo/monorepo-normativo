import { describe, it, expect } from '@jest/globals';
import { PoliticaAccesoContenidoNorma } from '../politicas/PoliticaAccesoContenidoNorma';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { EstadoSuscripcion } from '../../suscripciones/enums/EstadoSuscripcion';
import { EstadoNorma } from '../enums/EstadoNorma';
import { EstadoEditorialNorma } from '../enums/EstadoEditorialNorma';

function crearUsuario(id: string, rol: RolUsuario, correo = `${id}@test.com`): Usuario {
  return new Usuario({
    id,
    nombre: `Usuario ${id}`,
    apellido: 'Acceso',
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

interface OpcionesNorma {
  estadoJuridico?: EstadoNorma;
  estadoEditorial?: EstadoEditorialNorma;
}

function crearNorma(id: string, opciones: OpcionesNorma = {}): Norma {
  const estadoEditorial = opciones.estadoEditorial ?? EstadoEditorialNorma.PUBLICADA;

  return new Norma({
    id,
    numero: `RO-${id}`,
    titulo: `Norma ${id}`,
    contenido: [`Contenido de la norma ${id}`],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: opciones.estadoJuridico ?? EstadoNorma.VIGENTE,
    estadoEditorial,
    fechaExpedicion: new Date('2025-01-01'),
    edicionRegistroOficialId: `edicion-${id}`,
    fechaPublicacionEnSistema:
      estadoEditorial === EstadoEditorialNorma.PUBLICADA ? new Date('2025-01-03') : null,
  });
}

describe('PoliticaAccesoContenidoNorma', () => {
  const politica = new PoliticaAccesoContenidoNorma();
  const fechaReferencia = new Date('2025-06-01');

  it.each([
    RolUsuario.SUPERADMINISTRADOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.EDITOR,
    RolUsuario.SUSCRIPTOR,
  ])('permite acceso para el rol %s si cumple suscripción y publicación', (rol) => {
    const usuario = crearUsuario(`u-${rol}`, rol);
    const suscripcion = crearSuscripcion(`s-${rol}`, {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma(`n-${rol}`);

    expect(politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia })).toBe(true);
  });

  it.each([
    EstadoNorma.VIGENTE,
    EstadoNorma.REFORMADA,
    EstadoNorma.DEROGADA,
  ])('no bloquea por estado jurídico %s', (estadoJuridico) => {
    const usuario = crearUsuario(`u-${estadoJuridico}`, RolUsuario.EDITOR);
    const suscripcion = crearSuscripcion(`s-${estadoJuridico}`, {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma(`n-${estadoJuridico}`, { estadoJuridico });

    expect(politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia })).toBe(true);
  });

  it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
    'deniega acceso si la norma está en %s',
    (estadoEditorial) => {
      const usuario = crearUsuario(`u-${estadoEditorial}`, RolUsuario.ADMINISTRADOR);
      const suscripcion = crearSuscripcion(`s-${estadoEditorial}`, {
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma(`n-${estadoEditorial}`, { estadoEditorial });

      expect(
        politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
      ).toBe(false);
    },
  );

  it('deniega acceso si la suscripción no habilita el correo', () => {
    const usuario = crearUsuario('u-no-habilitado', RolUsuario.SUPERADMINISTRADOR);
    const suscripcion = crearSuscripcion('s-no-habilitado', {
      correoHabilitado: 'otro@test.com',
    });
    const norma = crearNorma('n-no-habilitado');

    expect(politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia })).toBe(false);
  });

  it.each([
    EstadoSuscripcion.INACTIVA,
    EstadoSuscripcion.VENCIDA,
    EstadoSuscripcion.CANCELADA,
  ])('deniega acceso si la suscripción está %s', (estado) => {
    const usuario = crearUsuario(`u-${estado}`, RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion(`s-${estado}`, {
      correoHabilitado: usuario.obtenerCorreo(),
      estado,
      fechaInicio: new Date('2024-01-01'),
      fechaFin: new Date('2025-01-01'),
    });
    const norma = crearNorma(`n-${estado}`);

    expect(politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia })).toBe(false);
  });

  it('deniega acceso si la suscripción todavía no está vigente', () => {
    const usuario = crearUsuario('u-futura', RolUsuario.ADMINISTRADOR);
    const suscripcion = crearSuscripcion('s-futura', {
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2030-01-01'),
    });
    const norma = crearNorma('n-futura');

    expect(politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia })).toBe(false);
  });
});

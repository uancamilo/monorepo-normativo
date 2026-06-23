import { describe, it, expect } from '@jest/globals';
import { PoliticaAccesoNormaSuscriptor } from '../politicas/PoliticaAccesoNormaSuscriptor';
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
    apellido: 'Suscriptor',
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
    contenido: `Contenido de la norma ${id}`,
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: `https://www.registroficial.gob.ec/${id}.pdf`,
    estadoJuridico: opciones.estadoJuridico ?? EstadoNorma.VIGENTE,
    estadoEditorial,
    fechaExpedicion: new Date('2025-01-01'),
    fechaPublicacionOficial: new Date('2025-01-02'),
    fechaPublicacionEnSistema:
      estadoEditorial === EstadoEditorialNorma.PUBLICADA
        ? new Date('2025-01-03')
        : null,
  });
}

describe('PoliticaAccesoNormaSuscriptor', () => {
  const politica = new PoliticaAccesoNormaSuscriptor();
  const fechaReferencia = new Date('2025-06-01');

  it('permite acceso a suscriptor con suscripción activa y norma editorialmente PUBLICADA', () => {
    const usuario = crearUsuario('u-1', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-1', {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma('n-1');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(true);
  });

  it.each([
    EstadoNorma.VIGENTE,
    EstadoNorma.REFORMADA,
    EstadoNorma.DEROGADA,
  ])(
    'permite acceso a norma jurídicamente %s si está editorialmente PUBLICADA',
    (estadoJuridico) => {
      const usuario = crearUsuario(`u-${estadoJuridico}`, RolUsuario.SUSCRIPTOR);
      const suscripcion = crearSuscripcion(`s-${estadoJuridico}`, {
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma(`n-${estadoJuridico}`, { estadoJuridico });

      expect(
        politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
      ).toBe(true);
    },
  );

  it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
    'deniega acceso si la norma está en %s',
    (estadoEditorial) => {
      const usuario = crearUsuario(`u-${estadoEditorial}`, RolUsuario.SUSCRIPTOR);
      const suscripcion = crearSuscripcion(`s-${estadoEditorial}`, {
        correoHabilitado: usuario.obtenerCorreo(),
      });
      const norma = crearNorma(`n-${estadoEditorial}`, { estadoEditorial });

      expect(
        politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
      ).toBe(false);
    },
  );

  it.each([
    RolUsuario.SUPERADMINISTRADOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.EDITOR,
  ])('deniega acceso si el usuario no es SUSCRIPTOR: %s', (rol) => {
    const usuario = crearUsuario(`u-${rol}`, rol);
    const suscripcion = crearSuscripcion(`s-${rol}`, {
      correoHabilitado: usuario.obtenerCorreo(),
    });
    const norma = crearNorma(`n-${rol}`);

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso si la suscripción no habilita el correo', () => {
    const usuario = crearUsuario('u-no-habilitado', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-no-habilitado', {
      correoHabilitado: 'otro@test.com',
    });
    const norma = crearNorma('n-no-habilitado');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso si la suscripción no está ACTIVA', () => {
    const usuario = crearUsuario('u-inactiva', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-inactiva', {
      correoHabilitado: usuario.obtenerCorreo(),
      estado: EstadoSuscripcion.INACTIVA,
    });
    const norma = crearNorma('n-inactiva');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso si la suscripción todavía no está vigente', () => {
    const usuario = crearUsuario('u-futura', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-futura', {
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2030-01-01'),
    });
    const norma = crearNorma('n-futura');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });

  it('deniega acceso si la suscripción está vencida por fecha', () => {
    const usuario = crearUsuario('u-vencida', RolUsuario.SUSCRIPTOR);
    const suscripcion = crearSuscripcion('s-vencida', {
      correoHabilitado: usuario.obtenerCorreo(),
      fechaInicio: new Date('2024-01-01'),
      fechaFin: new Date('2025-01-01'),
    });
    const norma = crearNorma('n-vencida');

    expect(
      politica.puedeAcceder({ usuario, suscripcion, norma, fechaReferencia }),
    ).toBe(false);
  });
});

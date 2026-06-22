import { describe, it, expect } from '@jest/globals';
import { Suscripcion, SuscripcionProps } from '../entidades/Suscripcion';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { EstadoSuscripcion } from '../enums/EstadoSuscripcion';

function crearProps(overrides: Partial<SuscripcionProps> = {}): SuscripcionProps {
  return {
    id: 's-1',
    clienteId: 'c-1',
    correosUsuariosHabilitados: ['usuario@test.com'],
    cantidadMaximaUsuarios: 1,
    estado: EstadoSuscripcion.ACTIVA,
    fechaInicio: new Date('2025-01-01'),
    fechaFin: new Date('2030-01-01'),
    ...overrides,
  };
}

function crearUsuario(correo: string): Usuario {
  return new Usuario({
    id: 'u-1',
    nombre: 'Usuario',
    correo,
    rol: RolUsuario.SUSCRIPTOR,
  });
}

describe('Suscripcion', () => {
  describe('construcción', () => {
    it('lanza error cuando el id está vacío', () => {
      expect(() => new Suscripcion(crearProps({ id: '' }))).toThrow(
        'El id de la suscripción no puede estar vacío',
      );
    });

    it('lanza error cuando el id contiene solo espacios', () => {
      expect(() => new Suscripcion(crearProps({ id: '   ' }))).toThrow(
        'El id de la suscripción no puede estar vacío',
      );
    });

    it('lanza error cuando el clienteId está vacío', () => {
      expect(() => new Suscripcion(crearProps({ clienteId: '' }))).toThrow(
        'El clienteId de la suscripción no puede estar vacío',
      );
    });

    it('lanza error cuando el clienteId contiene solo espacios', () => {
      expect(() => new Suscripcion(crearProps({ clienteId: '   ' }))).toThrow(
        'El clienteId de la suscripción no puede estar vacío',
      );
    });

    it('lanza error cuando correosUsuariosHabilitados está vacío', () => {
      expect(
        () => new Suscripcion(crearProps({ correosUsuariosHabilitados: [] })),
      ).toThrow('La suscripción debe habilitar al menos un correo de usuario');
    });

    it('lanza error cuando un correo habilitado está vacío', () => {
      expect(
        () => new Suscripcion(crearProps({ correosUsuariosHabilitados: [''] })),
      ).toThrow('Los correos de usuarios habilitados no pueden estar vacíos');
    });

    it('lanza error cuando un correo habilitado contiene solo espacios', () => {
      expect(
        () => new Suscripcion(crearProps({ correosUsuariosHabilitados: ['   '] })),
      ).toThrow('Los correos de usuarios habilitados no pueden estar vacíos');
    });

    it('normaliza los correos habilitados con trim y minúsculas', () => {
      const suscripcion = new Suscripcion(
        crearProps({ correosUsuariosHabilitados: ['  Usuario@Test.COM  '] }),
      );

      expect(suscripcion.correosUsuariosHabilitados).toEqual(['usuario@test.com']);
    });

    it('rechaza correos duplicados después de normalizarlos', () => {
      expect(
        () =>
          new Suscripcion(
            crearProps({
              correosUsuariosHabilitados: ['usuario@test.com', '  USUARIO@Test.COM  '],
              cantidadMaximaUsuarios: 2,
            }),
          ),
      ).toThrow('La suscripción no puede tener correos de usuarios habilitados duplicados');
    });

    it('rechaza cantidadMaximaUsuarios igual a cero', () => {
      expect(() => new Suscripcion(crearProps({ cantidadMaximaUsuarios: 0 }))).toThrow(
        'La cantidad máxima de usuarios debe ser un entero mayor que 0',
      );
    });

    it('rechaza cantidadMaximaUsuarios negativa', () => {
      expect(() => new Suscripcion(crearProps({ cantidadMaximaUsuarios: -1 }))).toThrow(
        'La cantidad máxima de usuarios debe ser un entero mayor que 0',
      );
    });

    it('rechaza cantidadMaximaUsuarios no entera', () => {
      expect(() => new Suscripcion(crearProps({ cantidadMaximaUsuarios: 1.5 }))).toThrow(
        'La cantidad máxima de usuarios debe ser un entero mayor que 0',
      );
    });

    it('rechaza más correos habilitados que cantidadMaximaUsuarios', () => {
      expect(
        () =>
          new Suscripcion(
            crearProps({
              correosUsuariosHabilitados: ['uno@test.com', 'dos@test.com'],
              cantidadMaximaUsuarios: 1,
            }),
          ),
      ).toThrow('La cantidad de correos habilitados no puede superar la cantidad máxima de usuarios');
    });

    it('permite una suscripción monousuario', () => {
      const suscripcion = new Suscripcion(
        crearProps({
          correosUsuariosHabilitados: ['unico@test.com'],
          cantidadMaximaUsuarios: 1,
        }),
      );

      expect(suscripcion.correosUsuariosHabilitados).toEqual(['unico@test.com']);
      expect(suscripcion.cantidadMaximaUsuarios).toBe(1);
    });

    it('permite una suscripción multiusuario', () => {
      const suscripcion = new Suscripcion(
        crearProps({
          correosUsuariosHabilitados: ['uno@test.com', 'dos@test.com'],
          cantidadMaximaUsuarios: 3,
        }),
      );

      expect(suscripcion.correosUsuariosHabilitados).toEqual([
        'uno@test.com',
        'dos@test.com',
      ]);
      expect(suscripcion.cantidadMaximaUsuarios).toBe(3);
    });

    it('lanza error cuando fechaInicio no es válida', () => {
      expect(
        () => new Suscripcion(crearProps({ fechaInicio: new Date('fecha-inválida') })),
      ).toThrow('fechaInicio debe ser una fecha válida');
    });

    it('lanza error cuando fechaFin no es válida', () => {
      expect(
        () => new Suscripcion(crearProps({ fechaFin: new Date('fecha-inválida') })),
      ).toThrow('fechaFin debe ser una fecha válida');
    });

    it('lanza error cuando fechaFin no es posterior a fechaInicio', () => {
      expect(
        () =>
          new Suscripcion(
            crearProps({
              fechaInicio: new Date('2025-01-01'),
              fechaFin: new Date('2025-01-01'),
            }),
          ),
      ).toThrow('fechaFin debe ser posterior a fechaInicio');
    });
  });

  describe('habilitaUsuario', () => {
    it('devuelve true cuando el correo del usuario está habilitado', () => {
      const usuario = crearUsuario('  USUARIO@Test.COM  ');
      const suscripcion = new Suscripcion(
        crearProps({ correosUsuariosHabilitados: ['usuario@test.com'] }),
      );

      expect(suscripcion.habilitaUsuario(usuario)).toBe(true);
    });

    it('devuelve false cuando el correo del usuario no está habilitado', () => {
      const usuario = crearUsuario('otro@test.com');
      const suscripcion = new Suscripcion(
        crearProps({ correosUsuariosHabilitados: ['usuario@test.com'] }),
      );

      expect(suscripcion.habilitaUsuario(usuario)).toBe(false);
    });
  });

  describe('estaActiva', () => {
    it('devuelve false si fechaReferencia es anterior a fechaInicio', () => {
      const suscripcion = new Suscripcion(crearProps());

      expect(suscripcion.estaActiva(new Date('2024-12-31'))).toBe(false);
    });

    it('devuelve true si fechaReferencia está dentro de [fechaInicio, fechaFin)', () => {
      const suscripcion = new Suscripcion(crearProps());

      expect(suscripcion.estaActiva(new Date('2025-01-01'))).toBe(true);
      expect(suscripcion.estaActiva(new Date('2029-12-31'))).toBe(true);
    });

    it('devuelve false si fechaReferencia es igual a fechaFin', () => {
      const suscripcion = new Suscripcion(crearProps());

      expect(suscripcion.estaActiva(new Date('2030-01-01'))).toBe(false);
    });

    it('devuelve false si fechaReferencia es posterior a fechaFin', () => {
      const suscripcion = new Suscripcion(crearProps());

      expect(suscripcion.estaActiva(new Date('2030-01-02'))).toBe(false);
    });

    it('devuelve false si el estado no es ACTIVA', () => {
      const suscripcion = new Suscripcion(
        crearProps({ estado: EstadoSuscripcion.VENCIDA }),
      );

      expect(suscripcion.estaActiva(new Date('2025-06-01'))).toBe(false);
    });
  });
});

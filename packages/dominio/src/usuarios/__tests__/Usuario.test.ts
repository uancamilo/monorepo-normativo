import { describe, it, expect } from '@jest/globals';
import { Usuario } from '../entidades/Usuario';
import { RolUsuario } from '../enums/RolUsuario';

describe('Usuario', () => {
  describe('construcción', () => {
    it('lanza error cuando el id está vacío', () => {
      expect(() => {
        new Usuario({
          id: '',
          nombre: 'Juan',
          apellido: 'Pérez',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El id del usuario no puede estar vacío');
    });

    it('lanza error cuando el id contiene solo espacios', () => {
      expect(() => {
        new Usuario({
          id: '   ',
          nombre: 'Juan',
          apellido: 'Pérez',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El id del usuario no puede estar vacío');
    });

    it('lanza error cuando el nombre está vacío', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: '',
          apellido: 'Pérez',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El nombre del usuario no puede estar vacío');
    });

    it('lanza error cuando el nombre contiene solo espacios', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: '   ',
          apellido: 'Pérez',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El nombre del usuario no puede estar vacío');
    });

    it('lanza error cuando el apellido está vacío', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: 'Juan',
          apellido: '',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El apellido del usuario no puede estar vacío');
    });

    it('lanza error cuando el apellido contiene solo espacios', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: 'Juan',
          apellido: '   ',
          correo: 'juan@test.com',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El apellido del usuario no puede estar vacío');
    });

    it('lanza error cuando el correo está vacío', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: 'Juan',
          apellido: 'Pérez',
          correo: '',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El correo del usuario no puede estar vacío');
    });

    it('lanza error cuando el correo contiene solo espacios', () => {
      expect(() => {
        new Usuario({
          id: 'u-1',
          nombre: 'Juan',
          apellido: 'Pérez',
          correo: '   ',
          rol: RolUsuario.SUSCRIPTOR,
        });
      }).toThrow('El correo del usuario no puede estar vacío');
    });
  });

  describe('tieneId', () => {
    it('devuelve true cuando el id coincide', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneId('u-1')).toBe(true);
    });

    it('devuelve false cuando el id no coincide', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneId('otro-id')).toBe(false);
    });
  });

  describe('normalización', () => {
    it('normaliza espacios laterales en id', () => {
      const usuario = new Usuario({
        id: '  u-1  ',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneId('u-1')).toBe(true);
      expect(usuario.obtenerId()).toBe('u-1');
    });

    it('normaliza espacios laterales en nombre', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: '  Juan Pérez  ',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.nombre).toBe('Juan Pérez');
    });

    it('normaliza espacios laterales en apellido', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: '  Pérez Gómez  ',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.apellido).toBe('Pérez Gómez');
    });

    it('normaliza espacios laterales y mayúsculas en correo', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: '  JUAN@Test.COM  ',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.correo).toBe('juan@test.com');
    });
  });

  describe('tieneCorreo', () => {
    it('devuelve true para el mismo correo aunque tenga mayúsculas o espacios', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneCorreo('  JUAN@Test.COM  ')).toBe(true);
    });

    it('devuelve false cuando el correo no coincide', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneCorreo('otro@test.com')).toBe(false);
    });
  });

  describe('obtenerCorreo', () => {
    it('devuelve el correo normalizado', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: '  JUAN@Test.COM  ',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.obtenerCorreo()).toBe('juan@test.com');
    });
  });

  describe('tieneRol', () => {
    it('devuelve true cuando el rol coincide', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.ADMINISTRADOR,
      });

      expect(usuario.tieneRol(RolUsuario.ADMINISTRADOR)).toBe(true);
    });

    it('devuelve false cuando el rol no coincide', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.SUSCRIPTOR,
      });

      expect(usuario.tieneRol(RolUsuario.ADMINISTRADOR)).toBe(false);
    });
  });

  describe('obtenerRol', () => {
    it('devuelve el rol del usuario', () => {
      const usuario = new Usuario({
        id: 'u-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan@test.com',
        rol: RolUsuario.EDITOR,
      });

      expect(usuario.obtenerRol()).toBe(RolUsuario.EDITOR);
    });
  });
});

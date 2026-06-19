import { describe, it, expect } from '@jest/globals';
import { Suscripcion } from '../entidades/Suscripcion';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { EstadoSuscripcion } from '../enums/EstadoSuscripcion';

function crearUsuario(id: string): Usuario {
  return new Usuario({
    id,
    nombre: 'Usuario ' + id,
    correo: id + '@test.com',
    rol: RolUsuario.SUSCRIPTOR,
  });
}

describe('Suscripcion', () => {
  describe('construcción', () => {
    it('lanza error cuando el id está vacío', () => {
      expect(() => {
        new Suscripcion({
          id: '',
          usuarioId: 'u-1',
          estado: EstadoSuscripcion.ACTIVA,
          fechaInicio: new Date('2025-01-01'),
          fechaFin: new Date('2030-01-01'),
        });
      }).toThrow('El id de la suscripción no puede estar vacío');
    });

    it('lanza error cuando el id contiene solo espacios', () => {
      expect(() => {
        new Suscripcion({
          id: '   ',
          usuarioId: 'u-1',
          estado: EstadoSuscripcion.ACTIVA,
          fechaInicio: new Date('2025-01-01'),
          fechaFin: new Date('2030-01-01'),
        });
      }).toThrow('El id de la suscripción no puede estar vacío');
    });

    it('lanza error cuando el usuarioId está vacío', () => {
      expect(() => {
        new Suscripcion({
          id: 's-1',
          usuarioId: '',
          estado: EstadoSuscripcion.ACTIVA,
          fechaInicio: new Date('2025-01-01'),
          fechaFin: new Date('2030-01-01'),
        });
      }).toThrow('El usuarioId de la suscripción no puede estar vacío');
    });

    it('lanza error cuando el usuarioId contiene solo espacios', () => {
      expect(() => {
        new Suscripcion({
          id: 's-1',
          usuarioId: '   ',
          estado: EstadoSuscripcion.ACTIVA,
          fechaInicio: new Date('2025-01-01'),
          fechaFin: new Date('2030-01-01'),
        });
      }).toThrow('El usuarioId de la suscripción no puede estar vacío');
    });
  });

  describe('perteneceAlUsuario', () => {
    it('devuelve true cuando la suscripción pertenece al usuario', () => {
      const usuario = crearUsuario('u-1');
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: usuario.obtenerId(),
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2030-01-01'),
      });

      expect(suscripcion.perteneceAlUsuario(usuario)).toBe(true);
    });

    it('devuelve false cuando la suscripción no pertenece al usuario', () => {
      const usuario = crearUsuario('u-1');
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: 'otro-usuario-id',
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2030-01-01'),
      });

      expect(suscripcion.perteneceAlUsuario(usuario)).toBe(false);
    });
  });

  describe('normalización', () => {
    it('normaliza espacios laterales en usuarioId para perteneceAlUsuario', () => {
      const usuario = crearUsuario('u-1');
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: '  u-1  ',
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2030-01-01'),
      });

      expect(suscripcion.perteneceAlUsuario(usuario)).toBe(true);
    });

    it('normaliza espacios laterales en id', () => {
      const suscripcion = new Suscripcion({
        id: '  s-1  ',
        usuarioId: 'u-1',
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2030-01-01'),
      });

      expect(suscripcion.id).toBe('s-1');
    });
  });

  describe('estaActiva', () => {
    it('devuelve true cuando el estado es ACTIVA y la fecha de fin es futura', () => {
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: 'u-1',
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2030-01-01'),
      });
      const fechaReferencia = new Date('2025-06-01');

      expect(suscripcion.estaActiva(fechaReferencia)).toBe(true);
    });

    it('devuelve false cuando el estado no es ACTIVA', () => {
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: 'u-1',
        estado: EstadoSuscripcion.VENCIDA,
        fechaInicio: new Date('2024-01-01'),
        fechaFin: new Date('2025-01-01'),
      });
      const fechaReferencia = new Date('2024-06-01');

      expect(suscripcion.estaActiva(fechaReferencia)).toBe(false);
    });

    it('devuelve false cuando el estado es ACTIVA pero la fecha de fin ya venció', () => {
      const suscripcion = new Suscripcion({
        id: 's-1',
        usuarioId: 'u-1',
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date('2024-01-01'),
        fechaFin: new Date('2024-06-30'),
      });
      const fechaReferencia = new Date('2025-01-01');

      expect(suscripcion.estaActiva(fechaReferencia)).toBe(false);
    });
  });
});

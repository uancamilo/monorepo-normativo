import { describe, it, expect } from '@jest/globals';
import { Norma } from '../entidades/Norma';
import { EstadoNorma } from '../enums/EstadoNorma';

describe('Norma', () => {
  describe('construcción', () => {
    it('lanza error cuando el id está vacío', () => {
      expect(() => {
        new Norma({
          id: '',
          titulo: 'Norma de prueba',
          contenido: 'Contenido',
          estado: EstadoNorma.BORRADOR,
          fechaPublicacion: null,
        });
      }).toThrow('El id de la norma no puede estar vacío');
    });

    it('lanza error cuando el id contiene solo espacios', () => {
      expect(() => {
        new Norma({
          id: '   ',
          titulo: 'Norma de prueba',
          contenido: 'Contenido',
          estado: EstadoNorma.BORRADOR,
          fechaPublicacion: null,
        });
      }).toThrow('El id de la norma no puede estar vacío');
    });

    it('lanza error cuando el título está vacío', () => {
      expect(() => {
        new Norma({
          id: 'n-1',
          titulo: '',
          contenido: 'Contenido',
          estado: EstadoNorma.BORRADOR,
          fechaPublicacion: null,
        });
      }).toThrow('El título de la norma no puede estar vacío');
    });

    it('lanza error cuando el título contiene solo espacios', () => {
      expect(() => {
        new Norma({
          id: 'n-1',
          titulo: '   ',
          contenido: 'Contenido',
          estado: EstadoNorma.BORRADOR,
          fechaPublicacion: null,
        });
      }).toThrow('El título de la norma no puede estar vacío');
    });

    it('lanza error cuando una norma PUBLICADA no tiene fecha de publicación', () => {
      expect(() => {
        new Norma({
          id: 'n-1',
          titulo: 'Norma de prueba',
          contenido: 'Contenido',
          estado: EstadoNorma.PUBLICADA,
          fechaPublicacion: null,
        });
      }).toThrow('Una norma publicada debe tener fecha de publicación');
    });
  });

  describe('normalización', () => {
    it('normaliza espacios laterales en id', () => {
      const norma = new Norma({
        id: '  n-1  ',
        titulo: 'Norma de prueba',
        contenido: 'Contenido',
        estado: EstadoNorma.BORRADOR,
        fechaPublicacion: null,
      });

      expect(norma.id).toBe('n-1');
    });

    it('normaliza espacios laterales en título', () => {
      const norma = new Norma({
        id: 'n-1',
        titulo: '  Norma de prueba  ',
        contenido: 'Contenido',
        estado: EstadoNorma.BORRADOR,
        fechaPublicacion: null,
      });

      expect(norma.titulo).toBe('Norma de prueba');
    });
  });

  describe('estaPublicada', () => {
    it('devuelve true cuando estado es PUBLICADA', () => {
      const norma = new Norma({
        id: 'n-1',
        titulo: 'Norma de prueba',
        contenido: 'Contenido',
        estado: EstadoNorma.PUBLICADA,
        fechaPublicacion: new Date('2025-06-01'),
      });

      expect(norma.estaPublicada()).toBe(true);
    });

    it('devuelve false cuando estado no es PUBLICADA', () => {
      const norma = new Norma({
        id: 'n-1',
        titulo: 'Norma de prueba',
        contenido: 'Contenido',
        estado: EstadoNorma.BORRADOR,
        fechaPublicacion: null,
      });

      expect(norma.estaPublicada()).toBe(false);
    });
  });
});

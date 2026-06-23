import { describe, it, expect } from '@jest/globals';
import { Norma, NormaProps } from '../entidades/Norma';
import { EstadoNorma } from '../enums/EstadoNorma';
import { EstadoEditorialNorma } from '../enums/EstadoEditorialNorma';

function crearProps(overrides: Partial<NormaProps> = {}): NormaProps {
  return {
    id: 'n-1',
    numero: 'RO-123',
    titulo: 'Ley de prueba',
    contenido: 'Contenido',
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: 'https://www.registroficial.gob.ec/norma.pdf',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.PUBLICADA,
    fechaExpedicion: new Date('2025-01-01'),
    fechaPublicacionOficial: new Date('2025-01-02'),
    fechaPublicacionEnSistema: new Date('2025-01-03'),
    ...overrides,
  };
}

describe('Norma', () => {
  describe('construcción', () => {
    it('crea una norma con metadata completa válida', () => {
      const fechaExpedicion = new Date('2025-01-01');
      const fechaPublicacionOficial = new Date('2025-01-02');
      const fechaPublicacionEnSistema = new Date('2025-01-03');

      const norma = new Norma(
        crearProps({
          id: '  n-1  ',
          numero: '  RO-123  ',
          titulo: '  Ley de prueba  ',
          tipoNorma: '  Ley  ',
          institucionExpide: '  Asamblea Nacional  ',
          fuente: 'https://www.registroficial.gob.ec/norma.pdf',
          estadoJuridico: EstadoNorma.VIGENTE,
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
          fechaExpedicion,
          fechaPublicacionOficial,
          fechaPublicacionEnSistema,
        }),
      );

      expect(norma.id).toBe('n-1');
      expect(norma.numero).toBe('RO-123');
      expect(norma.titulo).toBe('Ley de prueba');
      expect(norma.contenido).toBe('Contenido');
      expect(norma.tipoNorma).toBe('Ley');
      expect(norma.institucionExpide).toBe('Asamblea Nacional');
      expect(norma.fuente).toBe('https://www.registroficial.gob.ec/norma.pdf');
      expect(norma.estadoJuridico).toBe(EstadoNorma.VIGENTE);
      expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
      expect(norma.fechaExpedicion).toBe(fechaExpedicion);
      expect(norma.fechaPublicacionOficial).toBe(fechaPublicacionOficial);
      expect(norma.fechaPublicacionEnSistema).toBe(fechaPublicacionEnSistema);
    });

    it('lanza error cuando el id está vacío', () => {
      expect(() => new Norma(crearProps({ id: '' }))).toThrow(
        'El id de la norma no puede estar vacío',
      );
    });

    it('lanza error cuando el id contiene solo espacios', () => {
      expect(() => new Norma(crearProps({ id: '   ' }))).toThrow(
        'El id de la norma no puede estar vacío',
      );
    });

    it('lanza error cuando el título está vacío', () => {
      expect(() => new Norma(crearProps({ titulo: '' }))).toThrow(
        'El título de la norma no puede estar vacío',
      );
    });

    it('lanza error cuando el título contiene solo espacios', () => {
      expect(() => new Norma(crearProps({ titulo: '   ' }))).toThrow(
        'El título de la norma no puede estar vacío',
      );
    });

    it('lanza error cuando tipoNorma está vacío', () => {
      expect(() => new Norma(crearProps({ tipoNorma: '' }))).toThrow(
        'El tipo de norma no puede estar vacío',
      );
    });

    it('lanza error cuando tipoNorma contiene solo espacios', () => {
      expect(() => new Norma(crearProps({ tipoNorma: '   ' }))).toThrow(
        'El tipo de norma no puede estar vacío',
      );
    });

    it('lanza error cuando institucionExpide está vacía', () => {
      expect(() => new Norma(crearProps({ institucionExpide: '' }))).toThrow(
        'La institución que expide la norma no puede estar vacía',
      );
    });

    it('lanza error cuando institucionExpide contiene solo espacios', () => {
      expect(() => new Norma(crearProps({ institucionExpide: '   ' }))).toThrow(
        'La institución que expide la norma no puede estar vacía',
      );
    });

    it('lanza error cuando fuente está vacía', () => {
      expect(() => new Norma(crearProps({ fuente: '' }))).toThrow(
        'La fuente de la norma no puede estar vacía',
      );
    });

    it('lanza error cuando fuente contiene solo espacios', () => {
      expect(() => new Norma(crearProps({ fuente: '   ' }))).toThrow(
        'La fuente de la norma no puede estar vacía',
      );
    });

    it('lanza error cuando fuente no es una URL válida', () => {
      expect(() => new Norma(crearProps({ fuente: 'registro oficial' }))).toThrow(
        'La fuente de la norma debe ser una URL válida',
      );
    });
  });

  describe('normalización', () => {
    it('guarda numero vacío como null', () => {
      const norma = new Norma(crearProps({ numero: '' }));

      expect(norma.numero).toBeNull();
    });

    it('guarda numero con solo espacios como null', () => {
      const norma = new Norma(crearProps({ numero: '   ' }));

      expect(norma.numero).toBeNull();
    });

    it('normaliza numero informado con trim', () => {
      const norma = new Norma(crearProps({ numero: '  RO-456  ' }));

      expect(norma.numero).toBe('RO-456');
    });

    it('normaliza id, titulo, tipoNorma e institucionExpide con trim', () => {
      const norma = new Norma(
        crearProps({
          id: '  n-1  ',
          titulo: '  Ley de prueba  ',
          tipoNorma: '  Reglamento  ',
          institucionExpide: '  Ministerio de Trabajo  ',
        }),
      );

      expect(norma.id).toBe('n-1');
      expect(norma.titulo).toBe('Ley de prueba');
      expect(norma.tipoNorma).toBe('Reglamento');
      expect(norma.institucionExpide).toBe('Ministerio de Trabajo');
    });
  });

  describe('fechas', () => {
    it('lanza error cuando fechaExpedicion no es válida', () => {
      expect(() =>
        new Norma(crearProps({ fechaExpedicion: new Date('fecha-inválida') })),
      ).toThrow('fechaExpedicion debe ser una fecha válida');
    });

    it('lanza error cuando fechaPublicacionOficial no es válida', () => {
      expect(() =>
        new Norma(
          crearProps({ fechaPublicacionOficial: new Date('fecha-inválida') }),
        ),
      ).toThrow('fechaPublicacionOficial debe ser una fecha válida');
    });

    it('permite fechaPublicacionOficial igual a fechaExpedicion', () => {
      const fecha = new Date('2025-01-01');

      const norma = new Norma(
        crearProps({
          fechaExpedicion: fecha,
          fechaPublicacionOficial: fecha,
        }),
      );

      expect(norma.fechaPublicacionOficial).toBe(fecha);
    });

    it('lanza error cuando fechaPublicacionOficial es anterior a fechaExpedicion', () => {
      expect(() =>
        new Norma(
          crearProps({
            fechaExpedicion: new Date('2025-01-02'),
            fechaPublicacionOficial: new Date('2025-01-01'),
          }),
        ),
      ).toThrow('fechaPublicacionOficial no puede ser anterior a fechaExpedicion');
    });

    it('lanza error cuando fechaPublicacionEnSistema existe y no es válida', () => {
      expect(() =>
        new Norma(
          crearProps({ fechaPublicacionEnSistema: new Date('fecha-inválida') }),
        ),
      ).toThrow('fechaPublicacionEnSistema debe ser una fecha válida');
    });

    it('lanza error si estadoEditorial es PUBLICADA y falta fechaPublicacionEnSistema', () => {
      expect(() =>
        new Norma(
          crearProps({
            estadoEditorial: EstadoEditorialNorma.PUBLICADA,
            fechaPublicacionEnSistema: null,
          }),
        ),
      ).toThrow('Una norma publicada en sistema debe tener fecha de publicación en sistema');
    });

    it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
      'guarda fechaPublicacionEnSistema como null cuando estadoEditorial es %s',
      (estadoEditorial) => {
        const norma = new Norma(
          crearProps({
            estadoEditorial,
            fechaPublicacionEnSistema: new Date('2025-01-03'),
          }),
        );

        expect(norma.fechaPublicacionEnSistema).toBeNull();
      },
    );
  });

  describe('visibilidad para suscriptores', () => {
    it('devuelve true si estadoEditorial es PUBLICADA', () => {
      const norma = new Norma(
        crearProps({ estadoEditorial: EstadoEditorialNorma.PUBLICADA }),
      );

      expect(norma.estaVisibleParaSuscriptores()).toBe(true);
    });

    it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
      'devuelve false si estadoEditorial es %s',
      (estadoEditorial) => {
        const norma = new Norma(
          crearProps({
            estadoEditorial,
            fechaPublicacionEnSistema: null,
          }),
        );

        expect(norma.estaVisibleParaSuscriptores()).toBe(false);
      },
    );
  });

  describe('estado jurídico', () => {
    it.each([
      EstadoNorma.VIGENTE,
      EstadoNorma.REFORMADA,
      EstadoNorma.DEROGADA,
    ])('permite construir una norma con estado jurídico %s', (estadoJuridico) => {
      const norma = new Norma(crearProps({ estadoJuridico }));

      expect(norma.estadoJuridico).toBe(estadoJuridico);
    });
  });
});

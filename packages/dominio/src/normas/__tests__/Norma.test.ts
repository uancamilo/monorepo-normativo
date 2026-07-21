import { describe, it, expect } from '@jest/globals';
import { Norma, NormaProps } from '../entidades/Norma';
import { EstadoNorma } from '../enums/EstadoNorma';
import { EstadoEditorialNorma } from '../enums/EstadoEditorialNorma';

function crearProps(overrides: Partial<NormaProps> = {}): NormaProps {
  return {
    id: 'n-1',
    numero: 'RO-123',
    titulo: 'Ley de prueba',
    contenido: ['Artículo 1.- Contenido'],
    tipoNorma: 'LEY',
    institucionExpide: 'ASAMBLEA NACIONAL',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.PUBLICADA,
    fechaExpedicion: new Date('2025-01-01'),
    edicionRegistroOficialId: 'edicion-1',
    fechaPublicacionEnSistema: new Date('2025-01-03'),
    ...overrides,
  };
}

function crearPropsBorrador(overrides: Partial<NormaProps> = {}): NormaProps {
  return crearProps({
    estadoEditorial: EstadoEditorialNorma.BORRADOR,
    fechaPublicacionEnSistema: null,
    ...overrides,
  });
}

describe('Norma', () => {
  describe('construcción', () => {
    it('crea una norma con metadata completa válida', () => {
      const fechaExpedicion = new Date('2025-01-01');
      const fechaPublicacionEnSistema = new Date('2025-01-03');

      const norma = new Norma(
        crearProps({
          id: '  n-1  ',
          numero: '  RO-123  ',
          titulo: '  Ley de prueba  ',
          tipoNorma: '  LEY  ',
          institucionExpide: '  ASAMBLEA NACIONAL  ',
          estadoJuridico: EstadoNorma.VIGENTE,
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
          fechaExpedicion,
          edicionRegistroOficialId: '  edicion-1  ',
          fechaPublicacionEnSistema,
        }),
      );

      expect(norma.id).toBe('n-1');
      expect(norma.numero).toBe('RO-123');
      expect(norma.titulo).toBe('Ley de prueba');
      expect(norma.contenido).toEqual(['Artículo 1.- Contenido']);
      expect(norma.tipoNorma).toBe('LEY');
      expect(norma.institucionExpide).toBe('ASAMBLEA NACIONAL');
      expect(norma.estadoJuridico).toBe(EstadoNorma.VIGENTE);
      expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
      expect(norma.fechaExpedicion).toBe(fechaExpedicion);
      expect(norma.edicionRegistroOficialId).toBe('edicion-1');
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

    it('permite un BORRADOR con todos los campos detectables vacíos o nulos', () => {
      const norma = new Norma(
        crearPropsBorrador({
          numero: null,
          titulo: '',
          contenido: [],
          tipoNorma: '',
          institucionExpide: '',
          estadoJuridico: null,
          fechaExpedicion: null,
          edicionRegistroOficialId: null,
        }),
      );

      expect(norma.numero).toBeNull();
      expect(norma.titulo).toBe('');
      expect(norma.contenido).toEqual([]);
      expect(norma.tipoNorma).toBe('');
      expect(norma.institucionExpide).toBe('');
      expect(norma.estadoJuridico).toBeNull();
      expect(norma.fechaExpedicion).toBeNull();
      expect(norma.edicionRegistroOficialId).toBeNull();
    });

    it('no expone fuente ni fecha cruda como datos propios de la norma', () => {
      const norma = new Norma(crearPropsBorrador());

      expect('fuente' in norma).toBe(false);
      expect('fechaPublicacionRegistroOficialCruda' in norma).toBe(false);
    });

    it('lanza error cuando contenido no es un array de textos', () => {
      for (const contenido of ['texto plano', null, [1, 2]]) {
        expect(
          () =>
            new Norma(
              crearPropsBorrador({
                contenido: contenido as unknown as string[],
              }),
            ),
        ).toThrow('El contenido de la norma debe ser un array de textos');
      }
    });

    it('copia el contenido para que mutar el array externo no afecte la norma', () => {
      const contenido = ['Artículo 1'];
      const norma = new Norma(crearPropsBorrador({ contenido }));

      contenido.push('Artículo 2');

      expect(norma.contenido).toEqual(['Artículo 1']);
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
          tipoNorma: '  REGLAMENTO  ',
          institucionExpide: '  MINISTERIO DE TRABAJO  ',
        }),
      );

      expect(norma.id).toBe('n-1');
      expect(norma.titulo).toBe('Ley de prueba');
      expect(norma.tipoNorma).toBe('REGLAMENTO');
      expect(norma.institucionExpide).toBe('MINISTERIO DE TRABAJO');
    });
  });

  describe('fechas', () => {
    it('lanza error cuando fechaExpedicion no es válida', () => {
      expect(() =>
        new Norma(crearProps({ fechaExpedicion: new Date('fecha-inválida') })),
      ).toThrow('fechaExpedicion debe ser una fecha válida');
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

  describe('camposFaltantesParaPublicar', () => {
    it('devuelve vacío cuando los obligatorios de publicación están completos', () => {
      const norma = new Norma(
        crearPropsBorrador({
          numero: null,
          contenido: [],
          fechaExpedicion: null,
        }),
      );

      expect(norma.camposFaltantesParaPublicar()).toEqual([]);
      expect(norma.puedePublicarse()).toBe(true);
    });

    it.each([
      [{ tipoNorma: '' }, 'TIPO_NORMA_REQUERIDO'],
      [{ titulo: '' }, 'TITULO_REQUERIDO'],
      [{ institucionExpide: '' }, 'INSTITUCION_EXPIDE_REQUERIDA'],
      [{ estadoJuridico: null }, 'ESTADO_JURIDICO_REQUERIDO'],
      [
        { edicionRegistroOficialId: null },
        'EDICION_REGISTRO_OFICIAL_REQUERIDA',
      ],
    ] as Array<[Partial<NormaProps>, string]>)(
      'reporta %j como %s',
      (overrides, razonEsperada) => {
        const norma = new Norma(crearPropsBorrador(overrides));

        expect(norma.camposFaltantesParaPublicar()).toEqual([razonEsperada]);
      },
    );

    it('la fechaExpedicion nula no bloquea publicación', () => {
      const norma = new Norma(crearPropsBorrador({ fechaExpedicion: null }));

      expect(norma.camposFaltantesParaPublicar()).toEqual([]);
    });

    it('acumula todos los faltantes en orden', () => {
      const norma = new Norma(
        crearPropsBorrador({
          titulo: '',
          estadoJuridico: null,
          edicionRegistroOficialId: null,
        }),
      );

      expect(norma.camposFaltantesParaPublicar()).toEqual([
        'TITULO_REQUERIDO',
        'ESTADO_JURIDICO_REQUERIDO',
        'EDICION_REGISTRO_OFICIAL_REQUERIDA',
      ]);
    });
  });

  describe('actualizarDatosEditoriales', () => {
    it('completa campos vacíos y devuelve nueva instancia', () => {
      const norma = new Norma(crearPropsBorrador({ titulo: '', tipoNorma: '' }));

      const actualizada = norma.actualizarDatosEditoriales({
        titulo: 'LEY COMPLETADA',
        tipoNorma: 'RESOLUCIÓN',
      });

      expect(actualizada).not.toBe(norma);
      expect(actualizada.titulo).toBe('LEY COMPLETADA');
      expect(actualizada.tipoNorma).toBe('RESOLUCIÓN');
      expect(actualizada.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(norma.titulo).toBe('');
    });

    it('permite limpiar campos anulables', () => {
      const norma = new Norma(crearPropsBorrador());

      const actualizada = norma.actualizarDatosEditoriales({
        numero: null,
        fechaExpedicion: null,
        estadoJuridico: null,
      });

      expect(actualizada.numero).toBeNull();
      expect(actualizada.fechaExpedicion).toBeNull();
      expect(actualizada.estadoJuridico).toBeNull();
    });

    it('no cambia los campos no incluidos ni la edición asociada', () => {
      const norma = new Norma(crearPropsBorrador());

      const actualizada = norma.actualizarDatosEditoriales({ numero: '456' });

      expect(actualizada.numero).toBe('456');
      expect(actualizada.titulo).toBe(norma.titulo);
      expect(actualizada.edicionRegistroOficialId).toBe(
        norma.edicionRegistroOficialId,
      );
    });

    it('permite reemplazar contenido estructurado', () => {
      const norma = new Norma(crearPropsBorrador({ contenido: [] }));

      const actualizada = norma.actualizarDatosEditoriales({
        contenido: ['Artículo 1', 'Artículo 2'],
      });

      expect(actualizada.contenido).toEqual(['Artículo 1', 'Artículo 2']);
    });

  });

  describe('asociarEdicionRegistroOficial', () => {
    it('asocia la edición y devuelve nueva instancia', () => {
      const norma = new Norma(
        crearPropsBorrador({ edicionRegistroOficialId: null }),
      );

      const asociada = norma.asociarEdicionRegistroOficial('edicion-9');

      expect(asociada).not.toBe(norma);
      expect(asociada.edicionRegistroOficialId).toBe('edicion-9');
      expect(norma.edicionRegistroOficialId).toBeNull();
    });

    it('rechaza un id de edición vacío', () => {
      const norma = new Norma(crearPropsBorrador());

      expect(() => norma.asociarEdicionRegistroOficial('  ')).toThrow(
        'edicionRegistroOficialId no puede estar vacío',
      );
    });
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

    it('permite construir una norma PUBLICADA con contenido [] y la mantiene visible', () => {
      const norma = new Norma(
        crearProps({
          contenido: [],
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        }),
      );

      expect(norma.contenido).toEqual([]);
      expect(norma.tieneContenidoCompleto()).toBe(false);
      expect(norma.estaVisibleParaSuscriptores()).toBe(true);
    });

    it('lanza error al construir una PUBLICADA con obligatorios incompletos', () => {
      expect(() =>
        new Norma(
          crearProps({
            estadoEditorial: EstadoEditorialNorma.PUBLICADA,
            titulo: '',
          }),
        ),
      ).toThrow(
        'Una norma publicada debe tener sus datos obligatorios completos: TITULO_REQUERIDO',
      );
    });

    it('lanza error al construir una PUBLICADA sin edición del Registro Oficial', () => {
      expect(() =>
        new Norma(
          crearProps({
            estadoEditorial: EstadoEditorialNorma.PUBLICADA,
            edicionRegistroOficialId: null,
          }),
        ),
      ).toThrow(
        'Una norma publicada debe tener una edición del Registro Oficial asociada',
      );
    });
  });

  describe('estaPublicada', () => {
    it('devuelve true si estadoEditorial es PUBLICADA', () => {
      const norma = new Norma(
        crearProps({ estadoEditorial: EstadoEditorialNorma.PUBLICADA }),
      );

      expect(norma.estaPublicada()).toBe(true);
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

        expect(norma.estaPublicada()).toBe(false);
      },
    );
  });

  describe('publicar', () => {
    it.each([EstadoEditorialNorma.BORRADOR, EstadoEditorialNorma.EN_REVISION])(
      'publica una norma %s y devuelve una norma PUBLICADA',
      (estadoEditorial) => {
        const norma = new Norma(
          crearProps({
            estadoEditorial,
            fechaPublicacionEnSistema: null,
          }),
        );

        const publicada = norma.publicar(new Date('2025-02-01'));

        expect(publicada.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
        expect(publicada.estaPublicada()).toBe(true);
        expect(publicada.estaVisibleParaSuscriptores()).toBe(true);
      },
    );

    it('conserva metadata, edición, estado jurídico y contenido', () => {
      const norma = new Norma(
        crearPropsBorrador({
          estadoJuridico: EstadoNorma.REFORMADA,
          contenido: ['Contenido original'],
        }),
      );

      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(publicada.id).toBe(norma.id);
      expect(publicada.numero).toBe(norma.numero);
      expect(publicada.titulo).toBe(norma.titulo);
      expect(publicada.contenido).toEqual(['Contenido original']);
      expect(publicada.tipoNorma).toBe(norma.tipoNorma);
      expect(publicada.institucionExpide).toBe(norma.institucionExpide);
      expect(publicada.estadoJuridico).toBe(EstadoNorma.REFORMADA);
      expect(publicada.fechaExpedicion).toBe(norma.fechaExpedicion);
      expect(publicada.edicionRegistroOficialId).toBe(
        norma.edicionRegistroOficialId,
      );
    });

    it('permite publicar con contenido []', () => {
      const norma = new Norma(crearPropsBorrador({ contenido: [] }));

      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(publicada.contenido).toEqual([]);
      expect(publicada.estadoEditorial).toBe(EstadoEditorialNorma.PUBLICADA);
    });

    it('permite publicar sin numero', () => {
      const norma = new Norma(crearPropsBorrador({ numero: null }));

      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(publicada.numero).toBeNull();
      expect(publicada.estaPublicada()).toBe(true);
    });

    it('permite publicar con fechaExpedicion null', () => {
      const norma = new Norma(crearPropsBorrador({ fechaExpedicion: null }));

      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(publicada.fechaExpedicion).toBeNull();
      expect(publicada.estaPublicada()).toBe(true);
    });

    it('lanza error al publicar con requisitos incompletos', () => {
      const norma = new Norma(
        crearPropsBorrador({ edicionRegistroOficialId: null }),
      );

      expect(() => norma.publicar(new Date('2025-02-01'))).toThrow(
        'La norma no cumple los requisitos de publicación: EDICION_REGISTRO_OFICIAL_REQUERIDA',
      );
    });

    it('asigna fechaPublicacionEnSistema', () => {
      const norma = new Norma(crearPropsBorrador());
      const fecha = new Date('2025-02-01');

      const publicada = norma.publicar(fecha);

      expect(publicada.fechaPublicacionEnSistema).toBe(fecha);
    });

    it('no muta la instancia original (enfoque inmutable)', () => {
      const norma = new Norma(crearPropsBorrador());

      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(publicada).not.toBe(norma);
      expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(norma.fechaPublicacionEnSistema).toBeNull();
    });

    it('lanza error si la fecha de publicación es inválida', () => {
      const norma = new Norma(crearPropsBorrador());

      expect(() => norma.publicar(new Date('fecha-inválida'))).toThrow(
        'fechaPublicacionEnSistema debe ser una fecha válida',
      );
    });

    it('lanza error al publicar una norma ya publicada', () => {
      const norma = new Norma(crearPropsBorrador());
      const publicada = norma.publicar(new Date('2025-02-01'));

      expect(() => publicada.publicar(new Date('2025-03-01'))).toThrow(
        'Una norma ya publicada no puede publicarse nuevamente',
      );
    });
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

import { describe, it, expect } from '@jest/globals';
import {
  EdicionRegistroOficial,
  EdicionRegistroOficialProps,
} from '../entidades/EdicionRegistroOficial';
import { EstadoResolucionFuente } from '../enums/EstadoResolucionFuente';

function crearProps(
  overrides: Partial<EdicionRegistroOficialProps> = {},
): EdicionRegistroOficialProps {
  return {
    id: 'edicion-1',
    tipoPublicacionRegistroOficial: 'SRO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-04'),
    urlPdf: null,
    estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    ...overrides,
  };
}

const URL_PDF = 'https://www.registroficial.gob.ec/ediciones/sro-500.pdf';

describe('EdicionRegistroOficial', () => {
  describe('construcción', () => {
    it('crea una edición pendiente sin urlPdf', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      expect(edicion.id).toBe('edicion-1');
      expect(edicion.tipoPublicacionRegistroOficial).toBe('SRO');
      expect(edicion.numeroPublicacionRegistroOficial).toBe(500);
      expect(edicion.urlPdf).toBeNull();
      expect(edicion.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.PENDIENTE,
      );
    });

    it('lanza error cuando el id está vacío', () => {
      expect(() => new EdicionRegistroOficial(crearProps({ id: ' ' }))).toThrow(
        'El id de la edición no puede estar vacío',
      );
    });

    it('lanza error cuando el tipo de publicación está vacío', () => {
      expect(
        () =>
          new EdicionRegistroOficial(
            crearProps({ tipoPublicacionRegistroOficial: '' }),
          ),
      ).toThrow(
        'tipoPublicacionRegistroOficial de la edición no puede estar vacío',
      );
    });

    it('lanza error cuando el número de publicación no es entero positivo', () => {
      for (const numero of [0, -1, 2.5]) {
        expect(
          () =>
            new EdicionRegistroOficial(
              crearProps({ numeroPublicacionRegistroOficial: numero }),
            ),
        ).toThrow(
          'numeroPublicacionRegistroOficial de la edición debe ser un entero positivo',
        );
      }
    });

    it('lanza error cuando la fecha de publicación oficial no es válida', () => {
      expect(
        () =>
          new EdicionRegistroOficial(
            crearProps({ fechaPublicacionOficial: new Date('inválida') }),
          ),
      ).toThrow('fechaPublicacionOficial de la edición debe ser una fecha válida');
    });

    it('normaliza fechaPublicacionOficial como día calendario UTC', () => {
      const edicion = new EdicionRegistroOficial(
        crearProps({
          fechaPublicacionOficial: new Date('2026-05-04T18:45:12.123Z'),
        }),
      );

      expect(edicion.fechaPublicacionOficial.toISOString()).toBe(
        '2026-05-04T00:00:00.000Z',
      );
    });

    it('lanza error cuando urlPdf no es una URL válida', () => {
      expect(
        () =>
          new EdicionRegistroOficial(
            crearProps({
              urlPdf: 'no es url',
              estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
            }),
          ),
      ).toThrow('urlPdf de la edición debe ser una URL válida');
    });

    it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
      'lanza error si el estado %s no tiene urlPdf',
      (estadoResolucionFuente) => {
        expect(
          () =>
            new EdicionRegistroOficial(
              crearProps({ urlPdf: null, estadoResolucionFuente }),
            ),
        ).toThrow(`Una edición ${estadoResolucionFuente} debe tener urlPdf`);
      },
    );

    it.each([
      EstadoResolucionFuente.PENDIENTE,
      EstadoResolucionFuente.NO_ENCONTRADA,
      EstadoResolucionFuente.CONFLICTIVA,
    ])('lanza error si el estado %s tiene urlPdf', (estadoResolucionFuente) => {
      expect(
        () =>
          new EdicionRegistroOficial(
            crearProps({ urlPdf: URL_PDF, estadoResolucionFuente }),
          ),
      ).toThrow(`Una edición ${estadoResolucionFuente} no puede tener urlPdf`);
    });
  });

  describe('tieneFuenteValidaParaPublicacion', () => {
    it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
      'devuelve true con urlPdf y estado %s',
      (estadoResolucionFuente) => {
        const edicion = new EdicionRegistroOficial(
          crearProps({ urlPdf: URL_PDF, estadoResolucionFuente }),
        );

        expect(edicion.tieneFuenteValidaParaPublicacion()).toBe(true);
      },
    );

    it.each([
      EstadoResolucionFuente.PENDIENTE,
      EstadoResolucionFuente.NO_ENCONTRADA,
      EstadoResolucionFuente.CONFLICTIVA,
    ])('devuelve false con estado %s', (estadoResolucionFuente) => {
      const edicion = new EdicionRegistroOficial(
        crearProps({ urlPdf: null, estadoResolucionFuente }),
      );

      expect(edicion.tieneFuenteValidaParaPublicacion()).toBe(false);
    });
  });

  describe('resolución automática', () => {
    it('resuelve la fuente con coincidencia única y confiable', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      const resuelta = edicion.resolverFuente(URL_PDF);

      expect(resuelta).not.toBe(edicion);
      expect(resuelta.urlPdf).toBe(URL_PDF);
      expect(resuelta.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.RESUELTA,
      );
    });

    it('marca NO_ENCONTRADA sin urlPdf cuando no hay coincidencias', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      const marcada = edicion.marcarFuenteNoEncontrada();

      expect(marcada.urlPdf).toBeNull();
      expect(marcada.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.NO_ENCONTRADA,
      );
    });

    it('marca CONFLICTIVA sin urlPdf cuando hay múltiples coincidencias', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      const marcada = edicion.marcarFuenteConflictiva();

      expect(marcada.urlPdf).toBeNull();
      expect(marcada.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.CONFLICTIVA,
      );
    });

    it('permite reintentar la resolución desde NO_ENCONTRADA y CONFLICTIVA', () => {
      const noEncontrada = new EdicionRegistroOficial(crearProps()).marcarFuenteNoEncontrada();
      const conflictiva = new EdicionRegistroOficial(crearProps()).marcarFuenteConflictiva();

      expect(noEncontrada.resolverFuente(URL_PDF).estadoResolucionFuente).toBe(
        EstadoResolucionFuente.RESUELTA,
      );
      expect(conflictiva.resolverFuente(URL_PDF).estadoResolucionFuente).toBe(
        EstadoResolucionFuente.RESUELTA,
      );
    });

    it.each([EstadoResolucionFuente.RESUELTA, EstadoResolucionFuente.MANUAL])(
      'no sobrescribe una fuente %s',
      (estadoResolucionFuente) => {
        const edicion = new EdicionRegistroOficial(
          crearProps({ urlPdf: URL_PDF, estadoResolucionFuente }),
        );

        expect(edicion.admiteResolucionAutomatica()).toBe(false);
        expect(() => edicion.resolverFuente('https://otra.url/pdf')).toThrow(
          'La resolución automática no puede sobrescribir una fuente RESUELTA o MANUAL',
        );
        expect(() => edicion.marcarFuenteNoEncontrada()).toThrow(
          'La resolución automática no puede sobrescribir una fuente RESUELTA o MANUAL',
        );
        expect(() => edicion.marcarFuenteConflictiva()).toThrow(
          'La resolución automática no puede sobrescribir una fuente RESUELTA o MANUAL',
        );
      },
    );
  });

  describe('corrección manual', () => {
    it('establece urlPdf y estado MANUAL', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      const corregida = edicion.corregirFuenteManualmente(URL_PDF);

      expect(corregida.urlPdf).toBe(URL_PDF);
      expect(corregida.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
    });

    it('puede sobrescribir una fuente ya resuelta', () => {
      const resuelta = new EdicionRegistroOficial(crearProps()).resolverFuente(URL_PDF);

      const corregida = resuelta.corregirFuenteManualmente(
        'https://www.registroficial.gob.ec/ediciones/sro-500-v2.pdf',
      );

      expect(corregida.urlPdf).toBe(
        'https://www.registroficial.gob.ec/ediciones/sro-500-v2.pdf',
      );
      expect(corregida.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
    });

    it('rechaza una URL inválida', () => {
      const edicion = new EdicionRegistroOficial(crearProps());

      expect(() => edicion.corregirFuenteManualmente('no es url')).toThrow(
        'urlPdf de la edición debe ser una URL válida',
      );
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import { EdicionRegistroOficial, EstadoResolucionFuente } from '@normativo/dominio';
import { armarEdicionesRegistroOficial } from '../EdicionRegistroOficialAsociada';

function edicion(
  overrides: Partial<{
    id: string;
    tipoPublicacionRegistroOficial: string;
    numeroPublicacionRegistroOficial: number;
    fechaPublicacionOficial: Date;
    urlPdf: string | null;
    estadoResolucionFuente: EstadoResolucionFuente;
  }> = {},
): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id: 'edicion-principal',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-02'),
    urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
    ...overrides,
  });
}

describe('armarEdicionesRegistroOficial', () => {
  it('una norma sin principal proyecta una colección vacía', () => {
    expect(armarEdicionesRegistroOficial(null, [])).toEqual([]);
  });

  it('una norma con principal proyecta un único elemento PRINCIPAL', () => {
    expect(armarEdicionesRegistroOficial(edicion(), [])).toEqual([
      {
        tipoRelacion: 'PRINCIPAL',
        id: 'edicion-principal',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: '2026-05-02',
        fuente: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
      },
    ]);
  });

  it('ordena principal primero y cambios por fecha ascendente, id como desempate', () => {
    const principal = edicion({ id: 'p', fechaPublicacionOficial: new Date('2026-05-02') });
    const cambioTardio = edicion({
      id: 'c-tardio',
      tipoPublicacionRegistroOficial: 'SRO',
      numeroPublicacionRegistroOficial: 700,
      fechaPublicacionOficial: new Date('2027-03-10'),
      urlPdf: null,
      estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    });
    const cambioTempranoB = edicion({
      id: 'b',
      numeroPublicacionRegistroOficial: 600,
      fechaPublicacionOficial: new Date('2026-06-01'),
      urlPdf: null,
      estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    });
    const cambioTempranoA = edicion({
      id: 'a',
      numeroPublicacionRegistroOficial: 601,
      fechaPublicacionOficial: new Date('2026-06-01'),
      urlPdf: null,
      estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    });

    const proyeccion = armarEdicionesRegistroOficial(principal, [
      cambioTardio,
      cambioTempranoB,
      cambioTempranoA,
    ]);

    expect(proyeccion.map((e) => [e.tipoRelacion, e.id])).toEqual([
      ['PRINCIPAL', 'p'],
      ['CAMBIO', 'a'],
      ['CAMBIO', 'b'],
      ['CAMBIO', 'c-tardio'],
    ]);
  });

  it('proyecta fuente null para un cambio sin urlPdf', () => {
    const proyeccion = armarEdicionesRegistroOficial(edicion({ id: 'p' }), [
      edicion({
        id: 'c',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2027-03-10'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    ]);
    expect(proyeccion[1]).toEqual({
      tipoRelacion: 'CAMBIO',
      id: 'c',
      tipoPublicacionRegistroOficial: 'SRO',
      numeroPublicacionRegistroOficial: 700,
      fechaPublicacionOficial: '2027-03-10',
      fuente: null,
    });
  });

  it('nunca duplica la principal aunque aparezca también en la lista de cambios', () => {
    const principal = edicion({ id: 'p' });
    const proyeccion = armarEdicionesRegistroOficial(principal, [principal]);
    expect(proyeccion).toHaveLength(1);
    expect(proyeccion[0].tipoRelacion).toBe('PRINCIPAL');
  });
});

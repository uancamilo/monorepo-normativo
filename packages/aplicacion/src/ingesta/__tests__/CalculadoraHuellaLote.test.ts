import { describe, expect, it } from '@jest/globals';
import {
  CalculadoraHuellaLote,
  ContenidoLoteParaHuella,
} from '../servicios/CalculadoraHuellaLote';
import { EntradaDetectadaResumen } from '../modelos/IngestaRegistroOficial';

function crearEntrada(
  parcial: Partial<EntradaDetectadaResumen> = {},
): EntradaDetectadaResumen {
  return {
    posicion: 0,
    tipo: 'Acuerdo Ministerial',
    numero: '123',
    titulo: 'Acuerdo de prueba',
    institucion: 'Ministerio de Prueba',
    seccion: 'Función Ejecutiva',
    publicacion: {
      tipo: 'RO',
      numero: 500,
      fecha: '2026-05-02',
    },
    segmentoCrudo: 'Acuerdo Ministerial 123 ...',
    metadataExtraccion: { fila: 1, columna: 'a' },
    advertencias: [],
    confianza: 0.95,
    ...parcial,
  };
}

function crearContenido(
  parcial: Partial<ContenidoLoteParaHuella> = {},
): ContenidoLoteParaHuella {
  return {
    periodo: { anio: 2026, mes: 5 },
    urlResumenMensualRegistroOficial:
      'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
    versionExtractor: '1.0.0',
    entradasDetectadas: [crearEntrada()],
    ...parcial,
  };
}

describe('CalculadoraHuellaLote', () => {
  const calculadora = new CalculadoraHuellaLote();

  it('produce la misma huella para el mismo contenido', () => {
    expect(calculadora.calcular(crearContenido())).toBe(
      calculadora.calcular(crearContenido()),
    );
  });

  it('la huella es hexadecimal estable de 32 caracteres', () => {
    expect(calculadora.calcular(crearContenido())).toMatch(/^[0-9a-f]{32}$/);
  });

  it('no depende del orden de claves de los objetos', () => {
    const entradaReordenada = Object.fromEntries(
      Object.entries(crearEntrada()).reverse(),
    ) as unknown as EntradaDetectadaResumen;

    expect(
      calculadora.calcular(
        crearContenido({ entradasDetectadas: [entradaReordenada] }),
      ),
    ).toBe(calculadora.calcular(crearContenido()));
  });

  it('no depende del orden de llegada de las entradas (ordena por posición)', () => {
    const a = crearEntrada({ posicion: 0, titulo: 'A' });
    const b = crearEntrada({ posicion: 1, titulo: 'B' });

    expect(
      calculadora.calcular(crearContenido({ entradasDetectadas: [b, a] })),
    ).toBe(
      calculadora.calcular(crearContenido({ entradasDetectadas: [a, b] })),
    );
  });

  it('cambia si cambia el contenido de una entrada', () => {
    const original = calculadora.calcular(crearContenido());
    const modificado = calculadora.calcular(
      crearContenido({
        entradasDetectadas: [crearEntrada({ titulo: 'Otro título' })],
      }),
    );

    expect(modificado).not.toBe(original);
  });

  it('cambia si cambian periodo, URL del resumen o versionExtractor', () => {
    const original = calculadora.calcular(crearContenido());

    expect(
      calculadora.calcular(crearContenido({ versionExtractor: '2.0.0' })),
    ).not.toBe(original);
    expect(
      calculadora.calcular(
        crearContenido({ periodo: { anio: 2026, mes: 6 } }),
      ),
    ).not.toBe(original);
    expect(
      calculadora.calcular(
        crearContenido({
          urlResumenMensualRegistroOficial:
            'https://www.registroficial.gob.ec/resumen-2026-06.pdf',
        }),
      ),
    ).not.toBe(original);
  });

  it('distingue metadataExtraccion anidada distinta', () => {
    const original = calculadora.calcular(crearContenido());
    const modificado = calculadora.calcular(
      crearContenido({
        entradasDetectadas: [
          crearEntrada({ metadataExtraccion: { fila: 2, columna: 'a' } }),
        ],
      }),
    );

    expect(modificado).not.toBe(original);
  });
});

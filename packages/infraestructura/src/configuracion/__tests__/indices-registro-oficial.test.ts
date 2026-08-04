import { describe, expect, it } from '@jest/globals';
import {
  TIMEOUT_DESCARGA_INDICE_POR_DEFECTO_MS,
  obtenerConfiguracionIndicesRegistroOficial,
} from '../indices-registro-oficial';

describe('obtenerConfiguracionIndicesRegistroOficial', () => {
  it('usa el timeout de descarga por defecto', () => {
    expect(obtenerConfiguracionIndicesRegistroOficial({})).toEqual({
      timeoutDescargaMs: TIMEOUT_DESCARGA_INDICE_POR_DEFECTO_MS,
    });
  });

  it('permite configurar el timeout de descarga', () => {
    expect(
      obtenerConfiguracionIndicesRegistroOficial({
        INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS: '20000',
      }),
    ).toEqual({ timeoutDescargaMs: 20000 });
  });

  it.each(['0', '-1', '2.5', 'muchos', '999', '60001'])(
    'rechaza INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS fuera de rango: %s',
    (valor) => {
      expect(() =>
        obtenerConfiguracionIndicesRegistroOficial({
          INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS: valor,
        }),
      ).toThrow(
        'INDICE_REGISTRO_OFICIAL_TIMEOUT_DESCARGA_MS debe ser un entero entre 1000 y 60000',
      );
    },
  );
});

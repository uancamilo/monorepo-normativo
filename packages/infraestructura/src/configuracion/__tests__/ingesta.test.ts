import { describe, expect, it } from '@jest/globals';
import {
  LIMITE_CUERPO_JSON_POR_DEFECTO,
  obtenerConfiguracionIngesta,
} from '../ingesta';

describe('obtenerConfiguracionIngesta', () => {
  it('usa 1500 entradas y 8mb por defecto', () => {
    expect(obtenerConfiguracionIngesta({})).toEqual({
      limiteMaximoEntradas: 1500,
      limiteCuerpoJson: LIMITE_CUERPO_JSON_POR_DEFECTO,
    });
  });

  it('permite configurar el máximo de entradas y el límite HTTP', () => {
    expect(
      obtenerConfiguracionIngesta({
        INGESTA_MAX_ENTRADAS: '900',
        HTTP_JSON_BODY_LIMIT: '12MB',
      }),
    ).toEqual({
      limiteMaximoEntradas: 900,
      limiteCuerpoJson: '12mb',
    });
  });

  it.each(['0', '-1', '2.5', 'muchas'])(
    'rechaza INGESTA_MAX_ENTRADAS inválido: %s',
    (valor) => {
      expect(() =>
        obtenerConfiguracionIngesta({ INGESTA_MAX_ENTRADAS: valor }),
      ).toThrow('INGESTA_MAX_ENTRADAS debe ser un entero positivo');
    },
  );

  it.each(['0mb', '8', '8gb', 'mucho'])(
    'rechaza HTTP_JSON_BODY_LIMIT inválido: %s',
    (valor) => {
      expect(() =>
        obtenerConfiguracionIngesta({ HTTP_JSON_BODY_LIMIT: valor }),
      ).toThrow('HTTP_JSON_BODY_LIMIT debe usar un valor positivo en kb o mb');
    },
  );
});

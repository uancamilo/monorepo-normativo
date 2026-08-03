import { describe, expect, it } from '@jest/globals';
import {
  codificarCursorEdicionesLote,
  decodificarCursorEdicionesLote,
} from '../casos-uso/cursor-edicion-lote';

const LOTE_A = 'lote-a';
const LOTE_B = 'lote-b';

/**
 * Codifica un objeto arbitrario exactamente como lo haría el cursor real
 * (Base64URL de su JSON), sin pasar por `codificarCursorEdicionesLote`: así
 * las pruebas construyen cursores sintéticos (deliberadamente inválidos o
 * con formas que la función de producción nunca generaría) sin depender de
 * ningún atajo de producción.
 */
function codificarObjetoComoBase64Url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor), 'utf-8').toString('base64url');
}

function cursorValido(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    loteId: LOTE_A,
    fecha: '2026-05-04',
    edicionId: 'edicion-1',
    ...overrides,
  };
}

describe('cursor-edicion-lote', () => {
  it('1. codificar y decodificar un cursor válido conserva loteId, fecha e edicionId', () => {
    const fecha = new Date('2026-05-04T00:00:00.000Z');
    const cursor = codificarCursorEdicionesLote(LOTE_A, {
      fechaPublicacionOficial: fecha,
      edicionId: 'edicion-1',
    });

    const decodificado = decodificarCursorEdicionesLote(LOTE_A, cursor);

    expect(decodificado).toEqual({
      fechaPublicacionOficial: fecha,
      edicionId: 'edicion-1',
    });
  });

  it('2. rechaza 2026-02-29 (2026 no es bisiesto)', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ fecha: '2026-02-29' }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('3. rechaza 2026-02-31', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ fecha: '2026-02-31' }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('4. rechaza 2026-04-31', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ fecha: '2026-04-31' }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('5. acepta 2028-02-29 (2028 sí es bisiesto)', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ fecha: '2028-02-29' }),
    );
    const decodificado = decodificarCursorEdicionesLote(LOTE_A, cursor);
    expect(decodificado).toEqual({
      fechaPublicacionOficial: new Date('2028-02-29T00:00:00.000Z'),
      edicionId: 'edicion-1',
    });
  });

  it('6. rechaza una fecha sin formato YYYY-MM-DD', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ fecha: '2026/05/04' }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('7. rechaza un cursor con una propiedad adicional', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ extra: 'no-deberia-estar-aqui' }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('8. rechaza un cursor con una propiedad faltante', () => {
    const { edicionId: _edicionId, ...sinEdicionId } = cursorValido();
    const cursor = codificarObjetoComoBase64Url(sinEdicionId);
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('9. rechaza un cursor con versión desconocida', () => {
    const cursor = codificarObjetoComoBase64Url(cursorValido({ v: 2 }));
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('10. rechaza un cursor perteneciente a otro loteId', () => {
    const cursor = codificarObjetoComoBase64Url(
      cursorValido({ loteId: LOTE_B }),
    );
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  it('11. un cursor generado normalmente por codificarCursorEdicionesLote sigue siendo aceptado', () => {
    const cursor = codificarCursorEdicionesLote(LOTE_A, {
      fechaPublicacionOficial: new Date('2026-05-04T00:00:00.000Z'),
      edicionId: 'edicion-1',
    });
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).not.toBeNull();
  });

  describe('otras fechas calendario imposibles (evidencia adicional del round-trip)', () => {
    it.each(['2026-00-10', '2026-13-01', '2026-02-30'])(
      'rechaza %s',
      (fecha) => {
        const cursor = codificarObjetoComoBase64Url(cursorValido({ fecha }));
        expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
      },
    );

    it.each(['2026-02-28', '2026-04-30'])('acepta %s', (fecha) => {
      const cursor = codificarObjetoComoBase64Url(cursorValido({ fecha }));
      expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).not.toBeNull();
    });
  });

  it('un cursor sin la propiedad v (undefined en vez de faltante explícito) también se rechaza', () => {
    const cursor = codificarObjetoComoBase64Url({
      loteId: LOTE_A,
      fecha: '2026-05-04',
      edicionId: 'edicion-1',
    });
    expect(decodificarCursorEdicionesLote(LOTE_A, cursor)).toBeNull();
  });

  describe('validación Base64URL canónica y fail-closed (hallazgo P2)', () => {
    const cursorValidoTexto = codificarCursorEdicionesLote(LOTE_A, {
      fechaPublicacionOficial: new Date('2026-05-04T00:00:00.000Z'),
      edicionId: 'edicion-1',
    });

    it('sanity: el cursor válido de base sigue siendo aceptado', () => {
      expect(decodificarCursorEdicionesLote(LOTE_A, cursorValidoTexto)).toEqual({
        fechaPublicacionOficial: new Date('2026-05-04T00:00:00.000Z'),
        edicionId: 'edicion-1',
      });
    });

    it('rechaza un cursor válido seguido de "!!"', () => {
      expect(
        decodificarCursorEdicionesLote(LOTE_A, `${cursorValidoTexto}!!`),
      ).toBeNull();
    });

    it('rechaza un cursor válido seguido de "="', () => {
      expect(
        decodificarCursorEdicionesLote(LOTE_A, `${cursorValidoTexto}=`),
      ).toBeNull();
    });

    it('rechaza un cursor válido seguido de un salto de línea', () => {
      expect(
        decodificarCursorEdicionesLote(LOTE_A, `${cursorValidoTexto}\n`),
      ).toBeNull();
    });

    it('rechaza un cursor válido seguido de un espacio', () => {
      expect(
        decodificarCursorEdicionesLote(LOTE_A, `${cursorValidoTexto} `),
      ).toBeNull();
    });

    it('rechaza un cursor con un carácter ajeno al alfabeto Base64URL insertado en medio del texto', () => {
      const mitad = Math.floor(cursorValidoTexto.length / 2);
      const conCaracterAjeno =
        cursorValidoTexto.slice(0, mitad) + '!' + cursorValidoTexto.slice(mitad);
      expect(
        decodificarCursorEdicionesLote(LOTE_A, conCaracterAjeno),
      ).toBeNull();
    });

    it('rechaza una representación Base64URL decodificable pero no canónica (mismos bytes, texto distinto)', () => {
      // Busca, de forma determinista y sin hardcodear la posición, una
      // variante del último carácter que decodifique exactamente a los
      // mismos bytes que el cursor válido (bits sobrantes no canónicos del
      // último grupo de 6 bits) — la maleabilidad clásica de Base64 sin
      // padding. Este fixture se eligió deliberadamente con bits sobrantes:
      // si un cambio futuro elimina esa precondición, la prueba debe fallar
      // explícitamente en vez de dejar de ejercer el round-trip.
      const alfabeto =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const bytesOriginales = Buffer.from(cursorValidoTexto, 'base64url');
      const ultimo = cursorValidoTexto.length - 1;
      const prefijo = cursorValidoTexto.slice(0, ultimo);
      let varianteNoCanonica: string | null = null;
      for (const caracter of alfabeto) {
        if (caracter === cursorValidoTexto[ultimo]) continue;
        const candidato = prefijo + caracter;
        const bytesCandidato = Buffer.from(candidato, 'base64url');
        if (Buffer.compare(bytesCandidato, bytesOriginales) === 0) {
          varianteNoCanonica = candidato;
          break;
        }
      }

      if (varianteNoCanonica === null) {
        throw new Error(
          'El cursor de prueba debe admitir una variante Base64URL no canónica con los mismos bytes.',
        );
      }
      expect(varianteNoCanonica).not.toBe(cursorValidoTexto);
      expect(
        decodificarCursorEdicionesLote(LOTE_A, varianteNoCanonica),
      ).toBeNull();
    });
  });
});

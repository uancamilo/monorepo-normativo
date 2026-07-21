import { describe, expect, it } from '@jest/globals';
import {
  formatearFechaCalendario,
  normalizarFechaCalendario,
  parsearFechaCalendario,
} from '../fecha-calendario';

describe('fecha calendario', () => {
  it.each([
    ['2026-05-02', '2026-05-02T00:00:00.000Z'],
    ['2028-02-29', '2028-02-29T00:00:00.000Z'],
  ])('parsea %s como medianoche UTC', (valor, esperada) => {
    expect(parsearFechaCalendario(valor)?.toISOString()).toBe(esperada);
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-5-2',
    '02/05/2026',
    '2026-05-02T00:00:00.000Z',
    '2026-05-02T15:00:00-05:00',
    '',
  ])('rechaza el valor no canónico o imposible %s', (valor) => {
    expect(parsearFechaCalendario(valor)).toBeNull();
  });

  it('normaliza un Date válido al día UTC sin conservar hora', () => {
    const fecha = new Date('2026-05-02T18:45:12.123Z');

    expect(normalizarFechaCalendario(fecha).toISOString()).toBe(
      '2026-05-02T00:00:00.000Z',
    );
  });

  it('formatea siempre como YYYY-MM-DD', () => {
    expect(
      formatearFechaCalendario(new Date('2026-05-02T23:59:59.999Z')),
    ).toBe('2026-05-02');
  });

  it('rechaza Date inválido al normalizar y formatear', () => {
    const invalida = new Date('fecha-inválida');

    expect(() => normalizarFechaCalendario(invalida)).toThrow(
      'La fecha calendario debe ser válida',
    );
    expect(() => formatearFechaCalendario(invalida)).toThrow(
      'La fecha calendario debe ser válida',
    );
  });
});

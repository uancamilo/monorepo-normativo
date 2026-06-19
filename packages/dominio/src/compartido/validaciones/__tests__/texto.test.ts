import { describe, it, expect } from '@jest/globals';
import { normalizarTexto, estaTextoVacio } from '../texto';

describe('normalizarTexto', () => {
  it('elimina espacios laterales', () => {
    expect(normalizarTexto('  hola  ')).toBe('hola');
  });

  it('devuelve string vacío si el original solo tiene espacios', () => {
    expect(normalizarTexto('   ')).toBe('');
  });

  it('mantiene texto sin espacios laterales', () => {
    expect(normalizarTexto('hola')).toBe('hola');
  });
});

describe('estaTextoVacio', () => {
  it('devuelve true para string vacío', () => {
    expect(estaTextoVacio('')).toBe(true);
  });

  it('devuelve true para string con solo espacios', () => {
    expect(estaTextoVacio('   ')).toBe(true);
  });

  it('devuelve false para texto con contenido', () => {
    expect(estaTextoVacio('hola')).toBe(false);
  });

  it('devuelve false para texto con espacios laterales pero con contenido', () => {
    expect(estaTextoVacio('  hola  ')).toBe(false);
  });
});

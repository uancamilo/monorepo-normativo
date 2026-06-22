export const normalizarTexto = (valor: string): string => valor.trim();

export const estaTextoVacio = (valor: string): boolean => valor.trim().length === 0;

export const normalizarCorreo = (valor: string): string => valor.trim().toLowerCase();

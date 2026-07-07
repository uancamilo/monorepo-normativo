export const LONGITUD_MINIMA_CONTRASENA = 12;

/**
 * Política mínima de contraseñas (Fase 4E/4F): no vacía tras trim y longitud
 * mínima de 12 caracteres. Sin exigencias de complejidad adicionales por
 * ahora. Pura: sin dependencias de infraestructura.
 */
export class PoliticaContrasenas {
  esValida(contrasena: string): boolean {
    return (
      typeof contrasena === 'string' &&
      contrasena.trim().length > 0 &&
      contrasena.length >= LONGITUD_MINIMA_CONTRASENA
    );
  }
}

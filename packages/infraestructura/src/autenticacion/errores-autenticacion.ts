/**
 * Error único y genérico de verificación de tokens. No distingue causa
 * (firma, expiración, formato, claims) hacia el cliente para no filtrar
 * detalles del mecanismo de autenticación.
 */
export class ErrorTokenInvalido extends Error {
  constructor() {
    super('Token de autenticación inválido');
    this.name = 'ErrorTokenInvalido';
  }
}

/**
 * DTO HTTP de entrada para iniciar sesión.
 * La validación de contenido la hace el caso de uso IniciarSesion.
 */
export class LoginHttpDto {
  correo!: string;
  contrasena!: string;
}

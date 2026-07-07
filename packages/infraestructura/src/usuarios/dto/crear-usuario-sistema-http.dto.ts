/**
 * DTO HTTP de entrada para crear un usuario interno del sistema.
 * La validación de contenido la hace el caso de uso CrearUsuarioSistema.
 */
export class CrearUsuarioSistemaHttpDto {
  nombre!: string;
  apellido!: string;
  correo!: string;
  rol!: string;
  contrasenaInicial!: string;
}

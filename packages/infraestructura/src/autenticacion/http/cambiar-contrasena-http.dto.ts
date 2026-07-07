/**
 * DTO HTTP de entrada para cambiar la propia contraseña.
 * La validación de contenido la hace el caso de uso CambiarContrasenaPropia.
 */
export class CambiarContrasenaHttpDto {
  contrasenaActual!: string;
  nuevaContrasena!: string;
}

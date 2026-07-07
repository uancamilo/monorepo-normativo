export interface GeneradorHashContrasenas {
  generar(contrasenaPlano: string): Promise<string>;
}

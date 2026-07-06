export interface VerificadorContrasenas {
  verificar(contrasenaPlano: string, hash: string): Promise<boolean>;
}

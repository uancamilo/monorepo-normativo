import { RolUsuario } from '@normativo/dominio';

export interface CredencialesUsuario {
  usuarioId: string;
  rol: RolUsuario;
  hashContrasena: string | null;
}

export interface RepositorioCredencialesUsuarios {
  buscarPorCorreo(correoNormalizado: string): Promise<CredencialesUsuario | null>;
}

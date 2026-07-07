import { RolUsuario } from '@normativo/dominio';

/**
 * Datos del usuario interno a persistir. passwordHash ya viene hasheado:
 * la contraseña plana nunca llega a este puerto.
 */
export interface UsuarioSistemaNuevo {
  id: string;
  nombre: string;
  apellido: string;
  correoNormalizado: string;
  rol: RolUsuario;
  passwordHash: string;
}

export interface RepositorioUsuariosSistema {
  existeCorreo(correoNormalizado: string): Promise<boolean>;
  crear(usuario: UsuarioSistemaNuevo): Promise<void>;
}

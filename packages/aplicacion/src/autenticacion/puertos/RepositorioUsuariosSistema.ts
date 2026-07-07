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

/**
 * Resultado de la creación en persistencia. El duplicado de correo puede
 * detectarse aquí (garantía final, p. ej. UNIQUE en base de datos ante una
 * carrera) aunque la pre-verificación de aplicación haya pasado; el puerto lo
 * expresa sin filtrar detalles de infraestructura.
 */
export type ResultadoCrearUsuarioSistemaRepositorio =
  | { exitoso: true }
  | { exitoso: false; razon: 'CORREO_YA_REGISTRADO' };

export interface RepositorioUsuariosSistema {
  existeCorreo(correoNormalizado: string): Promise<boolean>;
  crear(
    usuario: UsuarioSistemaNuevo,
  ): Promise<ResultadoCrearUsuarioSistemaRepositorio>;
}

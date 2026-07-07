import { Usuario } from '@normativo/dominio';
import {
  RepositorioUsuariosSistema,
  ResultadoCrearUsuarioSistemaRepositorio,
  UsuarioSistemaNuevo,
} from '@normativo/aplicacion';
import { RepositorioUsuariosEnMemoria } from './RepositorioUsuariosEnMemoria';
import { RepositorioCredencialesUsuariosEnMemoria } from './RepositorioCredencialesUsuariosEnMemoria';

/**
 * Alta de usuarios internos en memoria (Fase 4G). Compone los repositorios en
 * memoria existentes para que el usuario creado sea visible tanto para los
 * casos de uso de normas (permisos) como para el login (credenciales).
 */
export class RepositorioUsuariosSistemaEnMemoria
  implements RepositorioUsuariosSistema
{
  constructor(
    private readonly repositorioUsuarios: RepositorioUsuariosEnMemoria,
    private readonly repositorioCredenciales: RepositorioCredencialesUsuariosEnMemoria,
  ) {}

  async existeCorreo(correoNormalizado: string): Promise<boolean> {
    return this.repositorioUsuarios.existeCorreo(correoNormalizado);
  }

  async crear(
    usuario: UsuarioSistemaNuevo,
  ): Promise<ResultadoCrearUsuarioSistemaRepositorio> {
    // Garantía final del adaptador (equivalente al UNIQUE de persistencia):
    // re-verifica el correo en el momento de crear, aun si la pre-verificación
    // de aplicación pasó antes.
    if (await this.repositorioUsuarios.existeCorreo(usuario.correoNormalizado)) {
      return { exitoso: false, razon: 'CORREO_YA_REGISTRADO' };
    }

    this.repositorioUsuarios.agregar(
      new Usuario({
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correoNormalizado,
        rol: usuario.rol,
      }),
    );
    await this.repositorioCredenciales.agregar(usuario.correoNormalizado, {
      usuarioId: usuario.id,
      rol: usuario.rol,
      hashContrasena: usuario.passwordHash,
    });

    return { exitoso: true };
  }
}

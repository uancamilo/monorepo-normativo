import {
  CredencialesUsuario,
  RepositorioCredencialesUsuarios,
} from '@normativo/aplicacion';
import { crearUsuariosSemilla } from './datos-semilla';
import { ServicioHashContrasenas } from '../autenticacion/hash-contrasenas';

/**
 * Contraseña semilla local/test para todos los usuarios en memoria.
 * Constante explícita de test: nunca se persiste en texto plano; los hashes se
 * generan con ServicioHashContrasenas al primer uso.
 */
export const CONTRASENA_SEMILLA = 'Password123!';

export class RepositorioCredencialesUsuariosEnMemoria
  implements RepositorioCredencialesUsuarios
{
  private credencialesPorCorreo: Map<string, CredencialesUsuario> | null = null;

  constructor(
    private readonly hashContrasenas: ServicioHashContrasenas = new ServicioHashContrasenas(),
  ) {}

  async buscarPorCorreo(
    correoNormalizado: string,
  ): Promise<CredencialesUsuario | null> {
    const credenciales = await this.obtenerCredenciales();
    return credenciales.get(correoNormalizado) ?? null;
  }

  async buscarPorUsuarioId(
    usuarioId: string,
  ): Promise<CredencialesUsuario | null> {
    const credenciales = await this.obtenerCredenciales();
    for (const credencial of credenciales.values()) {
      if (credencial.usuarioId === usuarioId) {
        return credencial;
      }
    }
    return null;
  }

  async actualizarPasswordHash(
    usuarioId: string,
    passwordHash: string,
  ): Promise<void> {
    const credenciales = await this.obtenerCredenciales();
    for (const credencial of credenciales.values()) {
      if (credencial.usuarioId === usuarioId) {
        credencial.hashContrasena = passwordHash;
        return;
      }
    }
  }

  private async obtenerCredenciales(): Promise<Map<string, CredencialesUsuario>> {
    if (this.credencialesPorCorreo === null) {
      const hash = await this.hashContrasenas.generar(CONTRASENA_SEMILLA);
      this.credencialesPorCorreo = new Map(
        crearUsuariosSemilla().map((usuario) => [
          usuario.obtenerCorreo(),
          {
            usuarioId: usuario.obtenerId(),
            rol: usuario.obtenerRol(),
            hashContrasena: hash,
          },
        ]),
      );
    }

    return this.credencialesPorCorreo;
  }
}

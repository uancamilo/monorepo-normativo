import { normalizarCorreo, RolUsuario } from '@normativo/dominio';
import { RepositorioCredencialesUsuarios } from '../puertos/RepositorioCredencialesUsuarios';
import { VerificadorContrasenas } from '../puertos/VerificadorContrasenas';

export type SolicitudIniciarSesion = {
  correo: string;
  contrasena: string;
};

export type RazonIniciarSesionFallido =
  | 'SOLICITUD_INVALIDA'
  | 'CREDENCIALES_INVALIDAS';

export type ResultadoIniciarSesion =
  | {
      exitoso: true;
      usuario: {
        id: string;
        rol: RolUsuario;
      };
    }
  | {
      exitoso: false;
      razon: RazonIniciarSesionFallido;
    };

export interface DependenciasIniciarSesion {
  repositorioCredenciales: RepositorioCredencialesUsuarios;
  verificadorContrasenas: VerificadorContrasenas;
}

/**
 * Verifica credenciales y retorna la identidad del usuario. No emite tokens:
 * eso es responsabilidad de infraestructura. Toda credencial mala (correo
 * inexistente, usuario sin contraseña o contraseña incorrecta) responde la
 * misma razón CREDENCIALES_INVALIDAS para no revelar si el correo existe.
 */
export class IniciarSesion {
  private readonly repositorioCredenciales: RepositorioCredencialesUsuarios;
  private readonly verificadorContrasenas: VerificadorContrasenas;

  constructor(dependencias: DependenciasIniciarSesion) {
    this.repositorioCredenciales = dependencias.repositorioCredenciales;
    this.verificadorContrasenas = dependencias.verificadorContrasenas;
  }

  async ejecutar(
    solicitud: SolicitudIniciarSesion,
  ): Promise<ResultadoIniciarSesion> {
    if (esTextoVacio(solicitud.correo) || esTextoVacio(solicitud.contrasena)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const correoNormalizado = normalizarCorreo(solicitud.correo);
    const credenciales =
      await this.repositorioCredenciales.buscarPorCorreo(correoNormalizado);

    if (credenciales === null || credenciales.hashContrasena === null) {
      return { exitoso: false, razon: 'CREDENCIALES_INVALIDAS' };
    }

    const coincide = await this.verificadorContrasenas.verificar(
      solicitud.contrasena,
      credenciales.hashContrasena,
    );

    if (!coincide) {
      return { exitoso: false, razon: 'CREDENCIALES_INVALIDAS' };
    }

    return {
      exitoso: true,
      usuario: {
        id: credenciales.usuarioId,
        rol: credenciales.rol,
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

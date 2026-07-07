import { RepositorioCredencialesUsuarios } from '../puertos/RepositorioCredencialesUsuarios';
import { VerificadorContrasenas } from '../puertos/VerificadorContrasenas';
import { GeneradorHashContrasenas } from '../puertos/GeneradorHashContrasenas';
import { PoliticaContrasenas } from '../politicas/PoliticaContrasenas';

export type SolicitudCambiarContrasenaPropia = {
  usuarioAutenticadoId: string;
  contrasenaActual: string;
  nuevaContrasena: string;
};

export type RazonCambiarContrasenaPropiaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'CREDENCIALES_INVALIDAS'
  | 'NUEVA_CONTRASENA_INVALIDA'
  | 'NUEVA_CONTRASENA_IGUAL_A_ACTUAL';

export type ResultadoCambiarContrasenaPropia =
  | { exitoso: true }
  | { exitoso: false; razon: RazonCambiarContrasenaPropiaFallido };

export interface DependenciasCambiarContrasenaPropia {
  repositorioCredenciales: RepositorioCredencialesUsuarios;
  verificadorContrasenas: VerificadorContrasenas;
  generadorHashContrasenas: GeneradorHashContrasenas;
  politicaContrasenas?: PoliticaContrasenas;
}

/**
 * Un usuario autenticado cambia su propia contraseña validando la actual.
 * Usuario inexistente, sin hash o contraseña actual incorrecta responden la
 * misma razón CREDENCIALES_INVALIDAS (no se revela cuál fue). No emite tokens
 * ni cierra sesiones (sin modelo de sesión/revocación todavía). Nunca retorna
 * hash ni contraseña.
 */
export class CambiarContrasenaPropia {
  private readonly repositorioCredenciales: RepositorioCredencialesUsuarios;
  private readonly verificadorContrasenas: VerificadorContrasenas;
  private readonly generadorHashContrasenas: GeneradorHashContrasenas;
  private readonly politicaContrasenas: PoliticaContrasenas;

  constructor(dependencias: DependenciasCambiarContrasenaPropia) {
    this.repositorioCredenciales = dependencias.repositorioCredenciales;
    this.verificadorContrasenas = dependencias.verificadorContrasenas;
    this.generadorHashContrasenas = dependencias.generadorHashContrasenas;
    this.politicaContrasenas =
      dependencias.politicaContrasenas ?? new PoliticaContrasenas();
  }

  async ejecutar(
    solicitud: SolicitudCambiarContrasenaPropia,
  ): Promise<ResultadoCambiarContrasenaPropia> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.contrasenaActual)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    if (!this.politicaContrasenas.esValida(solicitud.nuevaContrasena)) {
      return { exitoso: false, razon: 'NUEVA_CONTRASENA_INVALIDA' };
    }

    const credenciales = await this.repositorioCredenciales.buscarPorUsuarioId(
      solicitud.usuarioAutenticadoId,
    );

    if (credenciales === null || credenciales.hashContrasena === null) {
      return { exitoso: false, razon: 'CREDENCIALES_INVALIDAS' };
    }

    const actualCoincide = await this.verificadorContrasenas.verificar(
      solicitud.contrasenaActual,
      credenciales.hashContrasena,
    );

    if (!actualCoincide) {
      return { exitoso: false, razon: 'CREDENCIALES_INVALIDAS' };
    }

    // Solo tras confirmar la contraseña actual: si la actual no coincide, la
    // respuesta debe ser CREDENCIALES_INVALIDAS aunque nueva === actual.
    if (solicitud.nuevaContrasena === solicitud.contrasenaActual) {
      return { exitoso: false, razon: 'NUEVA_CONTRASENA_IGUAL_A_ACTUAL' };
    }

    const nuevoHash = await this.generadorHashContrasenas.generar(
      solicitud.nuevaContrasena,
    );
    await this.repositorioCredenciales.actualizarPasswordHash(
      credenciales.usuarioId,
      nuevoHash,
    );

    return { exitoso: true };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

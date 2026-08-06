import { RolUsuario } from '@normativo/dominio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';

export type SolicitudConsultarPerfilPropio = {
  usuarioAutenticadoId: string;
};

export type PerfilPropio = {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  rol: RolUsuario;
};

export type RazonConsultarPerfilPropioFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO';

export type ResultadoConsultarPerfilPropio =
  | {
      exitoso: true;
      perfil: PerfilPropio;
    }
  | {
      exitoso: false;
      razon: RazonConsultarPerfilPropioFallido;
    };

export interface DependenciasConsultarPerfilPropio {
  repositorioUsuarios: RepositorioUsuarios;
}

/**
 * Perfil propio de la sesión actual. La identidad llega ya verificada por
 * infraestructura (`sub` del Bearer): este caso de uso no acepta seleccionar
 * otro usuario, y el rol se relee del repositorio, nunca del claim del token.
 * Proyecta únicamente datos públicos del Usuario: sin credenciales, hash,
 * tokens ni suscripciones.
 */
export class ConsultarPerfilPropio {
  private readonly repositorioUsuarios: RepositorioUsuarios;

  constructor(dependencias: DependenciasConsultarPerfilPropio) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
  }

  async ejecutar(
    solicitud: SolicitudConsultarPerfilPropio,
  ): Promise<ResultadoConsultarPerfilPropio> {
    if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    return {
      exitoso: true,
      perfil: {
        id: usuario.obtenerId(),
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol,
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

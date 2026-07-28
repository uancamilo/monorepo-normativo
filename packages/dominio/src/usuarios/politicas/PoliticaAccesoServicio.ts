import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Usuario } from '../entidades/Usuario';
import { RolUsuario } from '../enums/RolUsuario';

const ROLES_USUARIOS_INTERNOS: ReadonlySet<RolUsuario> = new Set([
  RolUsuario.SUPERADMINISTRADOR,
  RolUsuario.ADMINISTRADOR,
  RolUsuario.EDITOR,
]);

export interface ContextoAccesoServicio {
  usuario: Usuario;
  /**
   * Para SUSCRIPTOR, identifica su pertenencia a la cuenta mediante el correo
   * habilitado de una suscripción que posee clienteId. Los usuarios internos
   * no necesitan suscripción.
   */
  suscripcion: Suscripcion | null;
  fechaReferencia?: Date;
}

/**
 * Frontera contractual común del servicio:
 * - SUPERADMINISTRADOR, ADMINISTRADOR y EDITOR son usuarios internos;
 * - SUSCRIPTOR requiere pertenecer a una cuenta por correo habilitado y tener
 *   una suscripción activa y vigente.
 */
export class PoliticaAccesoServicio {
  esUsuarioInterno(usuario: Usuario): boolean {
    return ROLES_USUARIOS_INTERNOS.has(usuario.obtenerRol());
  }

  requiereSuscripcion(usuario: Usuario): boolean {
    return !this.esUsuarioInterno(usuario);
  }

  puedeAcceder(contexto: ContextoAccesoServicio): boolean {
    const { usuario, suscripcion, fechaReferencia } = contexto;

    if (this.esUsuarioInterno(usuario)) {
      return true;
    }

    return (
      usuario.tieneRol(RolUsuario.SUSCRIPTOR) &&
      suscripcion !== null &&
      suscripcion.habilitaUsuario(usuario) &&
      suscripcion.estaActiva(fechaReferencia)
    );
  }
}

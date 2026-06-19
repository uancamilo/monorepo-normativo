import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';

export interface ContextoAcceso {
  usuario: Usuario;
  suscripcion: Suscripcion;
  norma: Norma;
  fechaReferencia?: Date;
}

export class PoliticaAccesoNorma {

  puedeAcceder(contexto: ContextoAcceso): boolean {
    const { usuario, suscripcion, norma, fechaReferencia } = contexto;

    if (!usuario.tieneRol(RolUsuario.SUSCRIPTOR)) {
      return false;
    }
    if (!norma.estaPublicada()) {
      return false;
    }
    if (!suscripcion.perteneceAlUsuario(usuario)) {
      return false;
    }
    if (!suscripcion.estaActiva(fechaReferencia)) {
      return false;
    }

    return true;
  }
}

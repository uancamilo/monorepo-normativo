import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';

export interface ContextoAccesoNormaSuscriptor {
  usuario: Usuario;
  suscripcion: Suscripcion;
  norma: Norma;
  fechaReferencia?: Date;
}

export class PoliticaAccesoNormaSuscriptor {
  puedeAcceder(contexto: ContextoAccesoNormaSuscriptor): boolean {
    const { usuario, suscripcion, norma, fechaReferencia } = contexto;

    if (!usuario.tieneRol(RolUsuario.SUSCRIPTOR)) {
      return false;
    }
    if (!suscripcion.habilitaUsuario(usuario)) {
      return false;
    }
    if (!suscripcion.estaActiva(fechaReferencia)) {
      return false;
    }
    if (!norma.estaVisibleParaSuscriptores()) {
      return false;
    }

    return true;
  }
}

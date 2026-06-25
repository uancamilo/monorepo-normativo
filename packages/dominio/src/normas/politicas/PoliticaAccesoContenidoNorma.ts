import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';

export interface ContextoAccesoContenidoNorma {
  usuario: Usuario;
  suscripcion: Suscripcion;
  norma: Norma;
  fechaReferencia?: Date;
}

export class PoliticaAccesoContenidoNorma {
  puedeAcceder(contexto: ContextoAccesoContenidoNorma): boolean {
    const { usuario, suscripcion, norma, fechaReferencia } = contexto;

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

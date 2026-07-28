import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { PoliticaAccesoServicio } from '../../usuarios/politicas/PoliticaAccesoServicio';

export interface ContextoAccesoContenidoNorma {
  usuario: Usuario;
  suscripcion: Suscripcion | null;
  norma: Norma;
  fechaReferencia?: Date;
}

export class PoliticaAccesoContenidoNorma {
  private readonly politicaAccesoServicio = new PoliticaAccesoServicio();

  puedeAcceder(contexto: ContextoAccesoContenidoNorma): boolean {
    const { usuario, suscripcion, norma, fechaReferencia } = contexto;

    if (!norma.estaVisibleParaSuscriptores()) {
      return false;
    }

    return this.politicaAccesoServicio.puedeAcceder({
      usuario,
      suscripcion,
      fechaReferencia,
    });
  }
}

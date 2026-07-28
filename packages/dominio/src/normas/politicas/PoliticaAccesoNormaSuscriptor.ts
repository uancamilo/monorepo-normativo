import { Usuario } from '../../usuarios/entidades/Usuario';
import { Suscripcion } from '../../suscripciones/entidades/Suscripcion';
import { Norma } from '../entidades/Norma';
import { RolUsuario } from '../../usuarios/enums/RolUsuario';
import { PoliticaAccesoContenidoNorma } from './PoliticaAccesoContenidoNorma';

/**
 * @deprecated Contexto de la política heredada `PoliticaAccesoNormaSuscriptor`,
 * que conserva la semántica basada en el rol global `SUSCRIPTOR`.
 *
 * Para la regla actual de acceso al contenido completo de una norma debe
 * usarse `ContextoAccesoContenidoNorma` junto con `PoliticaAccesoContenidoNorma`.
 *
 * La política actual distingue usuarios internos, que no necesitan
 * suscripción, de `SUSCRIPTOR`, que sí requiere acceso contractual.
 */
export interface ContextoAccesoNormaSuscriptor {
  usuario: Usuario;
  suscripcion: Suscripcion;
  norma: Norma;
  fechaReferencia?: Date;
}

/**
 * @deprecated Política heredada que conserva la semántica basada en el rol
 * global `SUSCRIPTOR`: solo permite el acceso si el usuario tiene ese rol y,
 * además, cumple las condiciones delegadas en `PoliticaAccesoContenidoNorma`.
 *
 * Para la regla actual de acceso al contenido completo de una norma debe
 * usarse `PoliticaAccesoContenidoNorma` directamente.
 *
 * Esta política heredada sigue siendo útil solo para expresar explícitamente
 * el flujo de `SUSCRIPTOR`; los usuarios internos usan la política actual.
 */
export class PoliticaAccesoNormaSuscriptor {
  private readonly politicaContenido = new PoliticaAccesoContenidoNorma();

  puedeAcceder(contexto: ContextoAccesoNormaSuscriptor): boolean {
    const { usuario, suscripcion, norma, fechaReferencia } = contexto;

    if (!usuario.tieneRol(RolUsuario.SUSCRIPTOR)) {
      return false;
    }

    return this.politicaContenido.puedeAcceder({
      usuario,
      suscripcion,
      norma,
      fechaReferencia,
    });
  }
}

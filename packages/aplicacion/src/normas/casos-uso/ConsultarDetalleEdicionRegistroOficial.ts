import { PoliticaAccesoServicio, Suscripcion } from '@normativo/dominio';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioSuscripciones } from '../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionRegistroOficialConsultada,
  armarEdicionRegistroOficialPublica,
  EdicionRegistroOficialVisible,
} from '../modelos/VistaEdicionRegistroOficial';

export type SolicitudConsultarDetalleEdicionRegistroOficial = {
  usuarioAutenticadoId: string;
  edicionId: string;
  fechaReferencia?: Date;
};

export type RazonConsultarDetalleEdicionFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'SUSCRIPCION_NO_ENCONTRADA'
  | 'ACCESO_DENEGADO'
  | 'EDICION_NO_ENCONTRADA';

export type ResultadoConsultarDetalleEdicion =
  | {
      exitoso: true;
      edicion: EdicionRegistroOficialVisible;
    }
  | {
      exitoso: false;
      razon: RazonConsultarDetalleEdicionFallido;
    };

export interface DependenciasConsultarDetalleEdicionRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  repositorioSuscripciones: RepositorioSuscripciones;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
  politicaAccesoServicio?: PoliticaAccesoServicio;
}

export class ConsultarDetalleEdicionRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly repositorioSuscripciones: RepositorioSuscripciones;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;
  private readonly politicaAccesoServicio: PoliticaAccesoServicio;

  constructor(
    dependencias: DependenciasConsultarDetalleEdicionRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.repositorioSuscripciones = dependencias.repositorioSuscripciones;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
    this.politicaAccesoServicio =
      dependencias.politicaAccesoServicio ?? new PoliticaAccesoServicio();
  }

  async ejecutar(
    solicitud: SolicitudConsultarDetalleEdicionRegistroOficial,
  ): Promise<ResultadoConsultarDetalleEdicion> {
    if (
      esTextoVacio(solicitud?.usuarioAutenticadoId) ||
      esTextoVacio(solicitud?.edicionId)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }
    let suscripcion: Suscripcion | null = null;
    if (this.politicaAccesoServicio.requiereSuscripcion(usuario)) {
      suscripcion =
        await this.repositorioSuscripciones.buscarPorCorreoHabilitado(
          usuario.obtenerCorreo(),
        );
      if (suscripcion === null) {
        return { exitoso: false, razon: 'SUSCRIPCION_NO_ENCONTRADA' };
      }
    }
    if (
      !this.politicaAccesoServicio.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: solicitud.fechaReferencia,
      })
    ) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const edicion = await this.repositorioEdiciones.buscarPorId(
      solicitud.edicionId.trim(),
    );
    if (edicion === null) {
      return { exitoso: false, razon: 'EDICION_NO_ENCONTRADA' };
    }
    const tieneVisibilidadEditorial =
      this.politicaGestionEditorial.puedeConsultarEdicionesIncompletasRegistroOficial(
        usuario,
      );
    if (
      !tieneVisibilidadEditorial &&
      !edicion.tieneFuenteValidaParaPublicacion()
    ) {
      return { exitoso: false, razon: 'EDICION_NO_ENCONTRADA' };
    }
    return {
      exitoso: true,
      edicion: tieneVisibilidadEditorial
        ? armarEdicionRegistroOficialConsultada(edicion)
        : armarEdicionRegistroOficialPublica(edicion),
    };
  }
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

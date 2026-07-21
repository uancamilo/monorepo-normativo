import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionRegistroOficialConsultada,
  EdicionRegistroOficialConsultada,
} from '../modelos/VistaEdicionRegistroOficial';

export type SolicitudConsultarDetalleEdicionRegistroOficial = {
  usuarioAutenticadoId: string;
  edicionId: string;
};

export type RazonConsultarDetalleEdicionFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'EDICION_NO_ENCONTRADA';

export type ResultadoConsultarDetalleEdicion =
  | {
      exitoso: true;
      edicion: EdicionRegistroOficialConsultada;
    }
  | {
      exitoso: false;
      razon: RazonConsultarDetalleEdicionFallido;
    };

export interface DependenciasConsultarDetalleEdicionRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

export class ConsultarDetalleEdicionRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(
    dependencias: DependenciasConsultarDetalleEdicionRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
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
    if (
      !this.politicaGestionEditorial.puedeConsultarEdicionesRegistroOficial(
        usuario,
      )
    ) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const edicion = await this.repositorioEdiciones.buscarPorId(
      solicitud.edicionId.trim(),
    );
    if (edicion === null) {
      return { exitoso: false, razon: 'EDICION_NO_ENCONTRADA' };
    }
    return {
      exitoso: true,
      edicion: armarEdicionRegistroOficialConsultada(edicion),
    };
  }
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

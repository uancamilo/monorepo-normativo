import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionRegistroOficialConsultada,
  EdicionRegistroOficialConsultada,
} from '../modelos/VistaEdicionRegistroOficial';

export type SolicitudConsultarEdicionesRegistroOficial = {
  usuarioAutenticadoId: string;
};

export type RazonConsultarEdicionesRegistroOficialFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO';

export type ResultadoConsultarEdicionesRegistroOficial =
  | { exitoso: true; ediciones: EdicionRegistroOficialConsultada[] }
  | { exitoso: false; razon: RazonConsultarEdicionesRegistroOficialFallido };

export interface DependenciasConsultarEdicionesRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

export class ConsultarEdicionesRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(
    dependencias: DependenciasConsultarEdicionesRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudConsultarEdicionesRegistroOficial,
  ): Promise<ResultadoConsultarEdicionesRegistroOficial> {
    if (esTextoVacio(solicitud?.usuarioAutenticadoId)) {
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

    const ediciones = await this.repositorioEdiciones.listar();
    return {
      exitoso: true,
      ediciones: ediciones.map(armarEdicionRegistroOficialConsultada),
    };
  }
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

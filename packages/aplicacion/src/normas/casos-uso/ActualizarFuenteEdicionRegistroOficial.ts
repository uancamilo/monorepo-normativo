import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionRegistroOficialConsultada,
  EdicionRegistroOficialConsultada,
} from '../modelos/VistaEdicionRegistroOficial';

export type SolicitudActualizarFuenteEdicionRegistroOficial = {
  usuarioAutenticadoId: string;
  edicionId: string;
  urlPdf: string;
};

export type RazonActualizarFuenteEdicionFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'EDICION_NO_ENCONTRADA';

export type ResultadoActualizarFuenteEdicionRegistroOficial =
  | {
      exitoso: true;
      edicion: EdicionRegistroOficialConsultada;
    }
  | {
      exitoso: false;
      razon: RazonActualizarFuenteEdicionFallido;
    };

export interface DependenciasActualizarFuenteEdicionRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Corrección manual de la fuente de una edición del Registro Oficial (EDITOR
 * y SUPERADMINISTRADOR). Actualiza `EdicionRegistroOficial.urlPdf` con estado
 * MANUAL: el cambio aplica a la edición completa y por proyección a todas
 * las normas asociadas, nunca a una norma individual.
 */
export class ActualizarFuenteEdicionRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(
    dependencias: DependenciasActualizarFuenteEdicionRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudActualizarFuenteEdicionRegistroOficial,
  ): Promise<ResultadoActualizarFuenteEdicionRegistroOficial> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.edicionId) ||
      esTextoVacio(solicitud.urlPdf)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedeCorregirFuenteEdiciones(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const edicion = await this.repositorioEdiciones.buscarPorId(
      solicitud.edicionId.trim(),
    );
    if (edicion === null) {
      return { exitoso: false, razon: 'EDICION_NO_ENCONTRADA' };
    }

    let edicionCorregida;
    try {
      edicionCorregida = edicion.corregirFuenteManualmente(
        solicitud.urlPdf.trim(),
      );
    } catch {
      // URL que viola las invariantes del dominio (no es una URL real).
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    await this.repositorioEdiciones.guardar(edicionCorregida);

    return {
      exitoso: true,
      edicion: armarEdicionRegistroOficialConsultada(edicionCorregida),
    };
  }
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

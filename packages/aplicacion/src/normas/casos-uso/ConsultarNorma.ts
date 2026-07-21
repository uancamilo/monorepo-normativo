import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { ConsultorOrigenRegistroOficialNorma } from '../puertos/ConsultorOrigenRegistroOficialNorma';
import { ConsultorCambiosEdicionRegistroOficial } from '../puertos/ConsultorCambiosEdicionRegistroOficial';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarDetalleEditorialNorma,
  DetalleEditorialNorma,
} from '../modelos/VistaEditorialNorma';

export type SolicitudConsultarNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
};

export type RazonConsultarNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'NORMA_NO_ENCONTRADA';

export type ResultadoConsultarNorma =
  | {
      exitoso: true;
      norma: DetalleEditorialNorma;
    }
  | {
      exitoso: false;
      razon: RazonConsultarNormaFallido;
    };

export interface DependenciasConsultarNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Detalle editorial de una norma (EDITOR y SUPERADMINISTRADOR). Si la norma
 * nació desde la ingesta del Registro Oficial, incluye `origenRegistroOficial`
 * (URL del resumen mensual + segmento crudo) para verificación visual de la
 * detección; nunca expone campos técnicos del lote. La principal y los
 * cambios se proyectan mediante la colección `edicionesRegistroOficial`.
 */
export class ConsultarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  private readonly consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasConsultarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.consultorOrigenRegistroOficial =
      dependencias.consultorOrigenRegistroOficial;
    this.consultorCambiosEdicion = dependencias.consultorCambiosEdicion;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudConsultarNorma,
  ): Promise<ResultadoConsultarNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.normaId)
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
      !this.politicaGestionEditorial.puedeConsultarNormasEditorialmente(usuario)
    ) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const norma = await this.repositorioNormas.buscarPorId(
      solicitud.normaId.trim(),
    );
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    const origen =
      await this.consultorOrigenRegistroOficial.buscarOrigenPorNormaId(
        norma.id,
      );

    const edicionesCambioIds =
      await this.consultorCambiosEdicion.buscarCambiosPorNormaId(norma.id);
    const idsAConsultar = [
      ...(norma.edicionRegistroOficialId === null
        ? []
        : [norma.edicionRegistroOficialId]),
      ...edicionesCambioIds,
    ];
    const ediciones = await this.repositorioEdiciones.buscarPorIds(idsAConsultar);
    const edicionesPorId = new Map(ediciones.map((e) => [e.id, e]));

    const principal =
      norma.edicionRegistroOficialId === null
        ? null
        : edicionesPorId.get(norma.edicionRegistroOficialId) ?? null;
    const edicionesCambio = edicionesCambioIds
      .map((id) => edicionesPorId.get(id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);

    return {
      exitoso: true,
      norma: armarDetalleEditorialNorma(
        norma,
        principal,
        edicionesCambio,
        origen,
      ),
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

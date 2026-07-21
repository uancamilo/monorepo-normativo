import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import { ConsultorOrigenRegistroOficialNorma } from '../puertos/ConsultorOrigenRegistroOficialNorma';
import {
  armarDetalleEditorialNorma,
  DetalleEditorialNorma,
} from '../modelos/VistaEditorialNorma';

export type SolicitudCambiarEdicionNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  edicionRegistroOficialId: string;
};

export type RazonCambiarEdicionNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'NORMA_NO_ENCONTRADA'
  | 'EDICION_NO_ENCONTRADA'
  // Una norma PUBLICADA solo puede reasociarse a una edición publicable
  // (RESUELTA o MANUAL con urlPdf), misma regla de fuente que al publicar.
  | 'FUENTE_REQUERIDA'
  // El estado editorial cambió entre la lectura y la persistencia: la
  // operación basada en el estado obsoleto no se aplica.
  | 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE';

export type ResultadoCambiarEdicionNorma =
  | {
      exitoso: true;
      norma: DetalleEditorialNorma;
    }
  | {
      exitoso: false;
      razon: RazonCambiarEdicionNormaFallido;
    };

export interface DependenciasCambiarEdicionNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Cambiar la edición del Registro Oficial asociada a una Norma (EDITOR o
 * SUPERADMINISTRADOR), incluida una norma ya PUBLICADA cuando la corrección
 * editorial lo requiere.
 * La principal anterior se conserva como una edición de CAMBIO de la norma.
 */
export class CambiarEdicionNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasCambiarEdicionNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.consultorOrigenRegistroOficial =
      dependencias.consultorOrigenRegistroOficial;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudCambiarEdicionNorma,
  ): Promise<ResultadoCambiarEdicionNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.normaId) ||
      esTextoVacio(solicitud.edicionRegistroOficialId)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedeActualizarNormas(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const norma = await this.repositorioNormas.buscarPorId(solicitud.normaId);
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    const edicion = await this.repositorioEdiciones.buscarPorId(
      solicitud.edicionRegistroOficialId,
    );
    if (edicion === null) {
      return { exitoso: false, razon: 'EDICION_NO_ENCONTRADA' };
    }

    // Una norma PUBLICADA nunca puede quedar asociada a una edición sin
    // fuente válida (PENDIENTE, NO_ENCONTRADA, CONFLICTIVA o sin urlPdf).
    if (norma.estaPublicada() && !edicion.tieneFuenteValidaParaPublicacion()) {
      return { exitoso: false, razon: 'FUENTE_REQUERIDA' };
    }

    // Reemplazo atómico de la principal, condicionado al estado editorial
    // leído (la regla de fuente se validó contra ese estado): la principal
    // anterior se conserva como cambio y la nueva se retira de los cambios si
    // ya estaba asociada allí. Solo se aplica si el estado no cambió
    // concurrentemente.
    const resultadoPersistencia =
      await this.repositorioNormas.reemplazarEdicionPrincipalSiEstado(
        norma.id,
        edicion.id,
        norma.estadoEditorial,
      );
    if (!resultadoPersistencia.actualizada) {
      return { exitoso: false, razon: resultadoPersistencia.razon };
    }

    const [edicionesCambio, origen] = await Promise.all([
      this.repositorioEdiciones.buscarPorIds(
        resultadoPersistencia.edicionesCambioIds,
      ),
      this.consultorOrigenRegistroOficial.buscarOrigenPorNormaId(norma.id),
    ]);

    return {
      exitoso: true,
      norma: armarDetalleEditorialNorma(
        resultadoPersistencia.norma,
        edicion,
        edicionesCambio,
        origen,
      ),
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

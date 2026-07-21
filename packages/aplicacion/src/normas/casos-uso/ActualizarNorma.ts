import { EstadoNorma } from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { ConsultorCambiosEdicionRegistroOficial } from '../puertos/ConsultorCambiosEdicionRegistroOficial';
import { ConsultorOrigenRegistroOficialNorma } from '../puertos/ConsultorOrigenRegistroOficialNorma';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarDetalleEditorialNorma,
  DetalleEditorialNorma,
} from '../modelos/VistaEditorialNorma';

/**
 * Campos editables por el flujo de corrección. `undefined` significa "no
 * cambiar"; `null` o texto vacío limpian el campo (permitido en BORRADOR).
 * La triple de publicación (tipo, número, fecha) pertenece a
 * EdicionRegistroOficial y no es editable aquí. Fuente tampoco lo es.
 */
export type CambiosActualizarNorma = {
  tipoNorma?: string;
  numero?: string | null;
  titulo?: string;
  institucionExpide?: string;
  fechaExpedicion?: Date | null;
  estadoJuridico?: EstadoNorma | null;
  contenido?: string[];
};

export type SolicitudActualizarNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  cambios: CambiosActualizarNorma;
};

export type RazonActualizarNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'NORMA_NO_ENCONTRADA'
  | 'NORMA_NO_EDITABLE';

export type ResultadoActualizarNorma =
  | {
      exitoso: true;
      norma: DetalleEditorialNorma;
    }
  | {
      exitoso: false;
      razon: RazonActualizarNormaFallido;
    };

export interface DependenciasActualizarNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Corrección editorial de una Norma en BORRADOR (EDITOR y SUPERADMINISTRADOR):
 * completa o corrige los campos detectados por el scraping. No publica ni
 * toca datos internos de ingesta.
 */
export class ActualizarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  private readonly consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasActualizarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.consultorCambiosEdicion = dependencias.consultorCambiosEdicion;
    this.consultorOrigenRegistroOficial =
      dependencias.consultorOrigenRegistroOficial;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudActualizarNorma,
  ): Promise<ResultadoActualizarNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.normaId) ||
      !esCambiosValido(solicitud.cambios)
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

    const norma = await this.repositorioNormas.buscarPorId(
      solicitud.normaId.trim(),
    );
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    if (norma.estaPublicada()) {
      return { exitoso: false, razon: 'NORMA_NO_EDITABLE' };
    }

    let normaActualizada;
    try {
      normaActualizada = norma.actualizarDatosEditoriales(solicitud.cambios);
    } catch {
      // Cambios que violan invariantes del dominio (URL inválida, fechas
      // incoherentes, etc.).
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    // Escritura condicionada a BORRADOR: si la norma fue publicada entre la
    // lectura y la persistencia, la corrección obsoleta no se aplica.
    const resultadoPersistencia =
      await this.repositorioNormas.actualizarBorrador(normaActualizada);
    if (!resultadoPersistencia.actualizada) {
      return { exitoso: false, razon: resultadoPersistencia.razon };
    }

    // La proyección se arma con lo que quedó persistido, nunca con la copia
    // local del caso de uso.
    const normaPersistida = resultadoPersistencia.norma;
    const [edicionesCambioIds, origen] = await Promise.all([
      this.consultorCambiosEdicion.buscarCambiosPorNormaId(normaPersistida.id),
      this.consultorOrigenRegistroOficial.buscarOrigenPorNormaId(
        normaPersistida.id,
      ),
    ]);
    const idsAConsultar = [
      ...(normaPersistida.edicionRegistroOficialId === null
        ? []
        : [normaPersistida.edicionRegistroOficialId]),
      ...edicionesCambioIds,
    ];
    const ediciones =
      await this.repositorioEdiciones.buscarPorIds(idsAConsultar);
    const edicionesPorId = new Map(ediciones.map((e) => [e.id, e]));

    const principal =
      normaPersistida.edicionRegistroOficialId === null
        ? null
        : edicionesPorId.get(normaPersistida.edicionRegistroOficialId) ?? null;
    const edicionesCambio = edicionesCambioIds
      .map((id) => edicionesPorId.get(id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);

    return {
      exitoso: true,
      norma: armarDetalleEditorialNorma(
        normaPersistida,
        principal,
        edicionesCambio,
        origen,
      ),
    };
  }
}

function esCambiosValido(cambios: CambiosActualizarNorma): boolean {
  if (cambios === null || typeof cambios !== 'object') {
    return false;
  }
  if (Object.keys(cambios).length === 0) {
    return false;
  }
  if (cambios.fechaExpedicion !== undefined && cambios.fechaExpedicion !== null && !esFechaValida(cambios.fechaExpedicion)) {
    return false;
  }
  if (
    cambios.estadoJuridico !== undefined &&
    cambios.estadoJuridico !== null &&
    !(Object.values(EstadoNorma) as string[]).includes(cambios.estadoJuridico)
  ) {
    return false;
  }
  if (
    cambios.contenido !== undefined &&
    (!Array.isArray(cambios.contenido) ||
      cambios.contenido.some((elemento) => typeof elemento !== 'string'))
  ) {
    return false;
  }
  return true;
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

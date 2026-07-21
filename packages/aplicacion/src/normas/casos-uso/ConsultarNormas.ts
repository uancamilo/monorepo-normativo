import { EdicionRegistroOficial, EstadoEditorialNorma } from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { ConsultorOrigenRegistroOficialNorma } from '../puertos/ConsultorOrigenRegistroOficialNorma';
import { ConsultorCambiosEdicionRegistroOficial } from '../puertos/ConsultorCambiosEdicionRegistroOficial';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarNormaEditorialConsultada,
  NormaEditorialConsultada,
} from '../modelos/VistaEditorialNorma';

export type SolicitudConsultarNormas = {
  usuarioAutenticadoId: string;
  /** Filtro opcional por estado editorial (p. ej. BORRADOR). */
  estadoEditorial?: string;
};

export type RazonConsultarNormasFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO';

export type ResultadoConsultarNormas =
  | {
      exitoso: true;
      /**
       * Lista editorial estándar, sin total embebido: si el consumidor
       * necesita el total, cuenta el array.
       */
      normas: NormaEditorialConsultada[];
    }
  | {
      exitoso: false;
      razon: RazonConsultarNormasFallido;
    };

export interface DependenciasConsultarNormas {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Consulta editorial de normas (EDITOR y SUPERADMINISTRADOR). El editor
 * revisa Normas en BORRADOR; no navega lotes ni audita el scraping. Las
 * ediciones asociadas y el origen mínimo de ingesta se consultan en bloque
 * para evitar N+1 y se proyectan sin campos singulares de fuente/edición.
 */
export class ConsultarNormas {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialNorma;
  private readonly consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasConsultarNormas) {
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
    solicitud: SolicitudConsultarNormas,
  ): Promise<ResultadoConsultarNormas> {
    if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const estadoEditorial = interpretarEstadoEditorial(
      solicitud.estadoEditorial,
    );
    if (estadoEditorial === 'INVALIDO') {
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

    const normas = await this.repositorioNormas.listar(
      estadoEditorial === undefined ? {} : { estadoEditorial },
    );

    const normaIds = normas.map((norma) => norma.id);
    // Lecturas en bloque: cambios por norma y orígenes por norma se resuelven
    // en una sola consulta cada una para evitar N+1 en el listado editorial.
    const [cambiosPorNormaId, origenesPorNormaId] = await Promise.all([
      this.consultorCambiosEdicion.buscarCambiosPorNormaIds(normaIds),
      this.consultorOrigenRegistroOficial.buscarOrigenesPorNormaIds(normaIds),
    ]);

    const edicionIds = [
      ...new Set(
        [
          ...normas.map((norma) => norma.edicionRegistroOficialId),
          ...[...cambiosPorNormaId.values()].flat(),
        ].filter((id): id is string => id !== null),
      ),
    ];
    const ediciones = await this.repositorioEdiciones.buscarPorIds(edicionIds);
    const edicionesPorId = new Map<string, EdicionRegistroOficial>(
      ediciones.map((edicion) => [edicion.id, edicion]),
    );

    const hidratar = (ids: string[]): EdicionRegistroOficial[] =>
      ids
        .map((id) => edicionesPorId.get(id))
        .filter((edicion): edicion is EdicionRegistroOficial => edicion !== undefined);

    return {
      exitoso: true,
      normas: normas.map((norma) =>
        armarNormaEditorialConsultada(
          norma,
          norma.edicionRegistroOficialId === null
            ? null
            : edicionesPorId.get(norma.edicionRegistroOficialId) ?? null,
          hidratar(cambiosPorNormaId.get(norma.id) ?? []),
          origenesPorNormaId.get(norma.id) ?? null,
        ),
      ),
    };
  }
}

function interpretarEstadoEditorial(
  valor: string | undefined,
): EstadoEditorialNorma | undefined | 'INVALIDO' {
  if (valor === undefined) {
    return undefined;
  }
  const valores = Object.values(EstadoEditorialNorma) as string[];
  return valores.includes(valor)
    ? (valor as EstadoEditorialNorma)
    : 'INVALIDO';
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

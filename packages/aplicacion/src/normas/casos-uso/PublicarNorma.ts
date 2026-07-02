import { EstadoEditorialNorma } from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { UnidadDeTrabajoPublicacionNorma } from '../puertos/UnidadDeTrabajoPublicacionNorma';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';

export type SolicitudPublicarNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  fechaPublicacionEnSistema?: Date;
};

export type RazonPublicarNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'NORMA_NO_ENCONTRADA'
  | 'ACCESO_DENEGADO'
  | 'NORMA_YA_PUBLICADA';

export type ResultadoPublicarNorma =
  | {
      exitoso: true;
      norma: {
        id: string;
        estadoEditorial: EstadoEditorialNorma.PUBLICADA;
        fechaPublicacionEnSistema: Date;
        tieneContenidoCompleto: boolean;
      };
    }
  | {
      exitoso: false;
      razon: RazonPublicarNormaFallido;
    };

export interface DependenciasPublicarNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

export class PublicarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasPublicarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.unidadDeTrabajoPublicacionNorma =
      dependencias.unidadDeTrabajoPublicacionNorma;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudPublicarNorma,
  ): Promise<ResultadoPublicarNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.normaId)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    if (
      solicitud.fechaPublicacionEnSistema !== undefined &&
      !esFechaValida(solicitud.fechaPublicacionEnSistema)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedePublicarNormas(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const norma = await this.repositorioNormas.buscarPorId(solicitud.normaId);
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    if (norma.estaPublicada()) {
      return { exitoso: false, razon: 'NORMA_YA_PUBLICADA' };
    }

    const fechaPublicacionEnSistema =
      solicitud.fechaPublicacionEnSistema ?? new Date();
    const normaPublicada = norma.publicar(fechaPublicacionEnSistema);

    const tieneContenidoCompleto = normaPublicada.contenido.trim().length > 0;

    await this.unidadDeTrabajoPublicacionNorma.guardarNormaPublicadaConEvento(
      normaPublicada,
      {
        normaId: normaPublicada.id,
        fechaPublicacionEnSistema,
        tieneContenidoCompleto,
      },
    );

    return {
      exitoso: true,
      norma: {
        id: normaPublicada.id,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema,
        tieneContenidoCompleto,
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

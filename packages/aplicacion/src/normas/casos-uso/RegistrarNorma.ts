import {
  EstadoEditorialNorma,
  EstadoNorma,
  Norma,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { GeneradorIds } from '../puertos/GeneradorIds';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';

export type SolicitudRegistrarNorma = {
  usuarioAutenticadoId: string;
  numero?: string | null;
  titulo: string;
  contenido?: string;
  tipoNorma: string;
  institucionExpide: string;
  fuente: string;
  estadoJuridico?: EstadoNorma;
  fechaExpedicion: Date;
  fechaPublicacionOficial: Date;
};

export type RazonRegistrarNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO';

export type ResultadoRegistrarNorma =
  | {
      exitoso: true;
      norma: {
        id: string;
        estadoEditorial: EstadoEditorialNorma.BORRADOR;
        estadoJuridico: EstadoNorma;
        tieneContenidoCompleto: boolean;
      };
    }
  | {
      exitoso: false;
      razon: RazonRegistrarNormaFallido;
    };

export interface DependenciasRegistrarNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  generadorIds: GeneradorIds;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

export class RegistrarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly generadorIds: GeneradorIds;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasRegistrarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.generadorIds = dependencias.generadorIds;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudRegistrarNorma,
  ): Promise<ResultadoRegistrarNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.titulo) ||
      esTextoVacio(solicitud.tipoNorma) ||
      esTextoVacio(solicitud.institucionExpide) ||
      esTextoVacio(solicitud.fuente)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    if (
      !esFechaValida(solicitud.fechaExpedicion) ||
      !esFechaValida(solicitud.fechaPublicacionOficial)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedeRegistrarNormas(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const estadoJuridico = solicitud.estadoJuridico ?? EstadoNorma.VIGENTE;

    let norma: Norma;
    try {
      norma = new Norma({
        id: this.generadorIds.generar(),
        numero: solicitud.numero ?? null,
        titulo: solicitud.titulo,
        contenido: solicitud.contenido ?? '',
        tipoNorma: solicitud.tipoNorma,
        institucionExpide: solicitud.institucionExpide,
        fuente: solicitud.fuente,
        estadoJuridico,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: solicitud.fechaExpedicion,
        fechaPublicacionOficial: solicitud.fechaPublicacionOficial,
        fechaPublicacionEnSistema: null,
      });
    } catch {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    await this.repositorioNormas.guardar(norma);

    return {
      exitoso: true,
      norma: {
        id: norma.id,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        estadoJuridico: norma.estadoJuridico,
        tieneContenidoCompleto: norma.contenido.trim().length > 0,
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

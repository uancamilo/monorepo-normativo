import {
  EstadoNorma,
  PoliticaAccesoContenidoNorma,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioSuscripciones } from '../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';

export type SolicitudConsultarContenidoNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  fechaReferencia?: Date;
};

export type ContenidoNormaConsultado = {
  id: string;
  numero: string | null;
  titulo: string;
  contenido: string;
  tieneContenidoCompleto: boolean;
  tipoNorma: string;
  institucionExpide: string;
  fuente: string;
  estadoJuridico: EstadoNorma;
  fechaExpedicion: Date;
  fechaPublicacionOficial: Date;
};

export type RazonConsultarContenidoNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'NORMA_NO_ENCONTRADA'
  | 'SUSCRIPCION_NO_ENCONTRADA'
  | 'ACCESO_DENEGADO';

export type ResultadoConsultarContenidoNorma =
  | {
      exitoso: true;
      contenido: ContenidoNormaConsultado;
    }
  | {
      exitoso: false;
      razon: RazonConsultarContenidoNormaFallido;
    };

export interface DependenciasConsultarContenidoNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioSuscripciones: RepositorioSuscripciones;
  politicaAcceso?: PoliticaAccesoContenidoNorma;
}

export class ConsultarContenidoNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioSuscripciones: RepositorioSuscripciones;
  private readonly politicaAcceso: PoliticaAccesoContenidoNorma;

  constructor(dependencias: DependenciasConsultarContenidoNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioSuscripciones = dependencias.repositorioSuscripciones;
    this.politicaAcceso =
      dependencias.politicaAcceso ?? new PoliticaAccesoContenidoNorma();
  }

  async ejecutar(
    solicitud: SolicitudConsultarContenidoNorma,
  ): Promise<ResultadoConsultarContenidoNorma> {
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

    const norma = await this.repositorioNormas.buscarPorId(solicitud.normaId);
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    const suscripcion =
      await this.repositorioSuscripciones.buscarPorCorreoHabilitado(
        usuario.obtenerCorreo(),
      );
    if (suscripcion === null) {
      return { exitoso: false, razon: 'SUSCRIPCION_NO_ENCONTRADA' };
    }

    const permitido = this.politicaAcceso.puedeAcceder({
      usuario,
      suscripcion,
      norma,
      fechaReferencia: solicitud.fechaReferencia,
    });

    if (!permitido) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    return {
      exitoso: true,
      contenido: {
        id: norma.id,
        numero: norma.numero,
        titulo: norma.titulo,
        contenido: norma.contenido,
        tieneContenidoCompleto: norma.contenido.trim().length > 0,
        tipoNorma: norma.tipoNorma,
        institucionExpide: norma.institucionExpide,
        fuente: norma.fuente,
        estadoJuridico: norma.estadoJuridico,
        fechaExpedicion: norma.fechaExpedicion,
        fechaPublicacionOficial: norma.fechaPublicacionOficial,
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

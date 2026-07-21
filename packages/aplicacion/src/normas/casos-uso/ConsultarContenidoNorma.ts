import {
  EstadoNorma,
  PoliticaAccesoContenidoNorma,
  formatearFechaCalendario,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioSuscripciones } from '../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { ConsultorCambiosEdicionRegistroOficial } from '../puertos/ConsultorCambiosEdicionRegistroOficial';
import {
  armarEdicionesRegistroOficial,
  EdicionRegistroOficialProyectada,
} from '../modelos/EdicionRegistroOficialAsociada';

export type SolicitudConsultarContenidoNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  fechaReferencia?: Date;
};

// Las normas publicadas tienen sus obligatorios completos (invariante del
// dominio), pero el tipo refleja el modelo: campos opcionales en BORRADOR.
// La trazabilidad al Registro Oficial sale de `edicionesRegistroOficial`: la
// principal de la norma publicada y solo los cambios publicables (RESUELTA o
// MANUAL con urlPdf); los cambios pendientes o sin URL no se exponen. No hay
// campos singulares de edición ni fuente.
export type ContenidoNormaConsultado = {
  id: string;
  numero: string | null;
  titulo: string;
  contenido: string[];
  tieneContenidoCompleto: boolean;
  tipoNorma: string;
  institucionExpide: string;
  estadoJuridico: EstadoNorma | null;
  /** Día jurídico en formato de contrato YYYY-MM-DD (no un timestamp). */
  fechaExpedicion: string | null;
  edicionesRegistroOficial: EdicionRegistroOficialProyectada[];
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
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  politicaAcceso?: PoliticaAccesoContenidoNorma;
}

export class ConsultarContenidoNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioSuscripciones: RepositorioSuscripciones;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial;
  private readonly politicaAcceso: PoliticaAccesoContenidoNorma;

  constructor(dependencias: DependenciasConsultarContenidoNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioSuscripciones = dependencias.repositorioSuscripciones;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.consultorCambiosEdicion = dependencias.consultorCambiosEdicion;
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

    // Trazabilidad publicable: la principal de la norma publicada y solo los
    // cambios con fuente publicable. Los cambios pendientes, no encontrados,
    // conflictivos o sin URL se ocultan al suscriptor.
    const edicionesCambioIds =
      await this.consultorCambiosEdicion.buscarCambiosPorNormaId(norma.id);
    const idsAConsultar = [
      ...(norma.edicionRegistroOficialId === null
        ? []
        : [norma.edicionRegistroOficialId]),
      ...edicionesCambioIds,
    ];
    const ediciones =
      await this.repositorioEdiciones.buscarPorIds(idsAConsultar);
    const edicionesPorId = new Map(ediciones.map((e) => [e.id, e]));

    const principal =
      norma.edicionRegistroOficialId === null
        ? null
        : edicionesPorId.get(norma.edicionRegistroOficialId) ?? null;
    const cambiosPublicables = edicionesCambioIds
      .map((id) => edicionesPorId.get(id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined)
      .filter((e) => e.tieneFuenteValidaParaPublicacion());

    return {
      exitoso: true,
      contenido: {
        id: norma.id,
        numero: norma.numero,
        titulo: norma.titulo,
        contenido: norma.contenido,
        tieneContenidoCompleto: norma.tieneContenidoCompleto(),
        tipoNorma: norma.tipoNorma,
        institucionExpide: norma.institucionExpide,
        estadoJuridico: norma.estadoJuridico,
        fechaExpedicion:
          norma.fechaExpedicion === null
            ? null
            : formatearFechaCalendario(norma.fechaExpedicion),
        edicionesRegistroOficial: armarEdicionesRegistroOficial(
          principal,
          cambiosPublicables,
        ),
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

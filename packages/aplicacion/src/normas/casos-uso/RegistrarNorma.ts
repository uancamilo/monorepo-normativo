import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { GeneradorIds } from '../puertos/GeneradorIds';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionesRegistroOficial,
  EdicionRegistroOficialProyectada,
} from '../modelos/EdicionRegistroOficialAsociada';

/**
 * Registro manual de una norma en BORRADOR. La norma no persiste fuente ni
 * triple de publicación: si la solicitud identifica la edición del Registro
 * Oficial (tipo + número + fecha de publicación oficial), se crea o reutiliza
 * la EdicionRegistroOficial y la fuente se resuelve/corrige a nivel de edición.
 */
export type SolicitudRegistrarNorma = {
  usuarioAutenticadoId: string;
  numero?: string | null;
  titulo: string;
  contenido?: string[];
  tipoNorma: string;
  institucionExpide: string;
  estadoJuridico?: EstadoNorma;
  fechaExpedicion?: Date | null;
  tipoPublicacionRegistroOficial?: string;
  numeroPublicacionRegistroOficial?: number | null;
  fechaPublicacionOficial?: Date | null;
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
        contenido: string[];
        edicionesRegistroOficial: EdicionRegistroOficialProyectada[];
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
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  generadorIds: GeneradorIds;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

export class RegistrarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly generadorIds: GeneradorIds;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasRegistrarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
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
      esTextoVacio(solicitud.institucionExpide)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    if (
      solicitud.fechaExpedicion !== undefined &&
      solicitud.fechaExpedicion !== null &&
      !esFechaValida(solicitud.fechaExpedicion)
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

    let edicionPropuesta: EdicionRegistroOficial | null;
    try {
      edicionPropuesta = this.prepararEdicion(solicitud);
    } catch {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    let norma: Norma;
    try {
      norma = new Norma({
        id: this.generadorIds.generar(),
        numero: solicitud.numero ?? null,
        titulo: solicitud.titulo,
        contenido: solicitud.contenido ?? [],
        tipoNorma: solicitud.tipoNorma,
        institucionExpide: solicitud.institucionExpide,
        estadoJuridico,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: solicitud.fechaExpedicion ?? null,
        edicionRegistroOficialId:
          edicionPropuesta === null ? null : edicionPropuesta.id,
        fechaPublicacionEnSistema: null,
      });
    } catch {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    let edicionPrincipal: EdicionRegistroOficial | null = null;
    if (edicionPropuesta !== null) {
      const persistida = await this.repositorioEdiciones.crearORecuperar(
        edicionPropuesta,
      );
      edicionPrincipal = persistida.edicion;
      if (persistida.edicion.id !== edicionPropuesta.id) {
        norma = norma.asociarEdicionRegistroOficial(persistida.edicion.id);
      }
    }
    await this.repositorioNormas.guardar(norma);

    return {
      exitoso: true,
      norma: {
        id: norma.id,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        estadoJuridico,
        contenido: norma.contenido,
        edicionesRegistroOficial: armarEdicionesRegistroOficial(
          edicionPrincipal,
          [],
        ),
        tieneContenidoCompleto: norma.tieneContenidoCompleto(),
      },
    };
  }

  /**
   * La edición se determina con la triple (tipo, número, fecha de publicación
   * oficial), que es todo-o-nada: los tres ausentes dejan la norma sin edición;
   * los tres presentes crean/reutilizan la edición. Cualquier triple parcial o
   * con número/fecha inválidos es una solicitud inválida (lanza y se traduce a
   * SOLICITUD_INVALIDA en `ejecutar`). No se fabrica fuente ni URL ficticia.
   */
  private prepararEdicion(
    solicitud: SolicitudRegistrarNorma,
  ): EdicionRegistroOficial | null {
    const tieneTipo =
      (solicitud.tipoPublicacionRegistroOficial ?? '').trim().length > 0;
    const tieneNumero =
      solicitud.numeroPublicacionRegistroOficial !== undefined &&
      solicitud.numeroPublicacionRegistroOficial !== null;
    const tieneFecha =
      solicitud.fechaPublicacionOficial !== undefined &&
      solicitud.fechaPublicacionOficial !== null;

    const presentes = [tieneTipo, tieneNumero, tieneFecha].filter(
      Boolean,
    ).length;
    if (presentes === 0) {
      return null;
    }
    if (presentes !== 3) {
      throw new Error('La triple de edición debe estar completa o ausente');
    }

    // Los tres presentes: el constructor de EdicionRegistroOficial valida que
    // el número sea entero positivo y la fecha un día calendario válido; si no,
    // lanza y `ejecutar` lo traduce a SOLICITUD_INVALIDA.
    return new EdicionRegistroOficial({
      id: this.generadorIds.generar(),
      tipoPublicacionRegistroOficial: (
        solicitud.tipoPublicacionRegistroOficial as string
      ).trim(),
      numeroPublicacionRegistroOficial:
        solicitud.numeroPublicacionRegistroOficial as number,
      fechaPublicacionOficial: solicitud.fechaPublicacionOficial as Date,
      urlPdf: null,
      estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    });
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

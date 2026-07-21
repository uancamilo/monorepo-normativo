import { EstadoNorma } from '../enums/EstadoNorma';
import { EstadoEditorialNorma } from '../enums/EstadoEditorialNorma';
import { estaTextoVacio, normalizarTexto } from '../../compartido/validaciones/texto';

/**
 * Requisitos propios de la norma para publicar, en el orden en que se
 * reportan. `numero`, `fechaExpedicion` y `contenido` no son obligatorios
 * para publicar (regla editorial). La triple de publicación (tipo, número,
 * fecha) pertenece a EdicionRegistroOficial y no valida aquí.
 */
export const RAZONES_PUBLICACION_INCOMPLETA = [
  'TIPO_NORMA_REQUERIDO',
  'TITULO_REQUERIDO',
  'INSTITUCION_EXPIDE_REQUERIDA',
  'ESTADO_JURIDICO_REQUERIDO',
  'EDICION_REGISTRO_OFICIAL_REQUERIDA',
] as const;

export type RazonPublicacionIncompleta =
  (typeof RAZONES_PUBLICACION_INCOMPLETA)[number];

export interface NormaProps {
  id: string;
  numero: string | null;
  titulo: string;
  /** Contenido estructurado; `[]` mientras no exista extracción de contenido. */
  contenido: string[];
  tipoNorma: string;
  institucionExpide: string;
  estadoJuridico: EstadoNorma | null;
  estadoEditorial: EstadoEditorialNorma;
  fechaExpedicion: Date | null;
  /**
   * Edición del Registro Oficial donde aparece publicada la norma. La norma
   * no persiste fuente ni triple de publicación: se proyectan desde urlPdf
   * y datos de la EdicionRegistroOficial.
   */
  edicionRegistroOficialId: string | null;
  fechaPublicacionEnSistema: Date | null;
}

/**
 * Cambios editoriales permitidos sobre una norma. El id, el estado editorial,
 * la edición asociada y la fecha de publicación en sistema no se editan por
 * este flujo: cambian solo por publicación o por la gestión de ediciones.
 * La triple de publicación (tipo, número, fecha) no existe en Norma.
 */
export type CambiosEditorialesNorma = {
  numero?: string | null;
  titulo?: string;
  contenido?: string[];
  tipoNorma?: string;
  institucionExpide?: string;
  estadoJuridico?: EstadoNorma | null;
  fechaExpedicion?: Date | null;
};

/**
 * Una norma en BORRADOR puede tener casi todos sus campos vacíos o nulos:
 * el scraping puede fallar en la detección y el editor los completa después.
 * La obligatoriedad de los datos jurídicos se exige recién al publicar.
 */
export class Norma {
  readonly id: string;
  readonly numero: string | null;
  readonly titulo: string;
  readonly contenido: string[];
  readonly tipoNorma: string;
  readonly institucionExpide: string;
  readonly estadoJuridico: EstadoNorma | null;
  readonly estadoEditorial: EstadoEditorialNorma;
  readonly fechaExpedicion: Date | null;
  readonly edicionRegistroOficialId: string | null;
  readonly fechaPublicacionEnSistema: Date | null;

  constructor(props: NormaProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la norma no puede estar vacío');
    }

    if (!esContenidoValido(props.contenido)) {
      throw new Error('El contenido de la norma debe ser un array de textos');
    }

    if (props.fechaExpedicion !== null && !esFechaValida(props.fechaExpedicion)) {
      throw new Error('fechaExpedicion debe ser una fecha válida');
    }

    if (
      props.fechaPublicacionEnSistema !== null &&
      !esFechaValida(props.fechaPublicacionEnSistema)
    ) {
      throw new Error('fechaPublicacionEnSistema debe ser una fecha válida');
    }

    this.id = normalizarTexto(props.id);
    this.numero = normalizarTextoOpcional(props.numero);
    this.titulo = normalizarTexto(props.titulo);
    this.contenido = [...props.contenido];
    this.tipoNorma = normalizarTexto(props.tipoNorma);
    this.institucionExpide = normalizarTexto(props.institucionExpide);
    this.estadoJuridico = props.estadoJuridico;
    this.estadoEditorial = props.estadoEditorial;
    this.fechaExpedicion = props.fechaExpedicion;
    this.edicionRegistroOficialId = normalizarTextoOpcional(
      props.edicionRegistroOficialId,
    );
    this.fechaPublicacionEnSistema =
      props.estadoEditorial === EstadoEditorialNorma.PUBLICADA
        ? props.fechaPublicacionEnSistema
        : null;

    if (props.estadoEditorial === EstadoEditorialNorma.PUBLICADA) {
      if (props.fechaPublicacionEnSistema === null) {
        throw new Error(
          'Una norma publicada en sistema debe tener fecha de publicación en sistema',
        );
      }
      if (props.edicionRegistroOficialId === null) {
        throw new Error(
          'Una norma publicada debe tener una edición del Registro Oficial asociada',
        );
      }
      const faltantes = this.camposFaltantesParaPublicar();
      if (faltantes.length > 0) {
        throw new Error(
          `Una norma publicada debe tener sus datos obligatorios completos: ${faltantes.join(', ')}`,
        );
      }
    }
  }

  estaVisibleParaSuscriptores(): boolean {
    return this.estadoEditorial === EstadoEditorialNorma.PUBLICADA;
  }

  estaPublicada(): boolean {
    return this.estaVisibleParaSuscriptores();
  }

  tieneContenidoCompleto(): boolean {
    return this.contenido.length > 0;
  }

  /**
   * Requisitos de publicación pendientes propios de la norma. `numero`,
   * `fechaExpedicion` y `contenido` pueden estar vacíos incluso en una norma
   * publicada. La triple de publicación y validez de fuente se verifican en
   * el flujo de publicación contra la EdicionRegistroOficial.
   */
  camposFaltantesParaPublicar(): RazonPublicacionIncompleta[] {
    const faltantes: RazonPublicacionIncompleta[] = [];
    if (estaTextoVacio(this.tipoNorma)) {
      faltantes.push('TIPO_NORMA_REQUERIDO');
    }
    if (estaTextoVacio(this.titulo)) {
      faltantes.push('TITULO_REQUERIDO');
    }
    if (estaTextoVacio(this.institucionExpide)) {
      faltantes.push('INSTITUCION_EXPIDE_REQUERIDA');
    }
    if (this.estadoJuridico === null) {
      faltantes.push('ESTADO_JURIDICO_REQUERIDO');
    }
    if (this.edicionRegistroOficialId === null) {
      faltantes.push('EDICION_REGISTRO_OFICIAL_REQUERIDA');
    }
    return faltantes;
  }

  puedePublicarse(): boolean {
    return !this.estaPublicada() && this.camposFaltantesParaPublicar().length === 0;
  }

  actualizarDatosEditoriales(cambios: CambiosEditorialesNorma): Norma {
    return new Norma({
      id: this.id,
      numero: cambios.numero !== undefined ? cambios.numero : this.numero,
      titulo: cambios.titulo ?? this.titulo,
      contenido: cambios.contenido ?? this.contenido,
      tipoNorma: cambios.tipoNorma ?? this.tipoNorma,
      institucionExpide: cambios.institucionExpide ?? this.institucionExpide,
      estadoJuridico:
        cambios.estadoJuridico !== undefined
          ? cambios.estadoJuridico
          : this.estadoJuridico,
      estadoEditorial: this.estadoEditorial,
      fechaExpedicion:
        cambios.fechaExpedicion !== undefined
          ? cambios.fechaExpedicion
          : this.fechaExpedicion,
      edicionRegistroOficialId: this.edicionRegistroOficialId,
      fechaPublicacionEnSistema: this.fechaPublicacionEnSistema,
    });
  }

  /** Asociación con su edición del Registro Oficial (flujo de ingesta/registro). */
  asociarEdicionRegistroOficial(edicionRegistroOficialId: string): Norma {
    if (estaTextoVacio(edicionRegistroOficialId)) {
      throw new Error('edicionRegistroOficialId no puede estar vacío');
    }
    return new Norma({
      ...this.aProps(),
      edicionRegistroOficialId,
    });
  }

  publicar(fechaPublicacionEnSistema: Date): Norma {
    if (this.estaPublicada()) {
      throw new Error('Una norma ya publicada no puede publicarse nuevamente');
    }
    const faltantes = this.camposFaltantesParaPublicar();
    if (faltantes.length > 0) {
      throw new Error(
        `La norma no cumple los requisitos de publicación: ${faltantes.join(', ')}`,
      );
    }

    return new Norma({
      ...this.aProps(),
      estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      fechaPublicacionEnSistema,
    });
  }

  private aProps(): NormaProps {
    return {
      id: this.id,
      numero: this.numero,
      titulo: this.titulo,
      contenido: this.contenido,
      tipoNorma: this.tipoNorma,
      institucionExpide: this.institucionExpide,
      estadoJuridico: this.estadoJuridico,
      estadoEditorial: this.estadoEditorial,
      fechaExpedicion: this.fechaExpedicion,
      edicionRegistroOficialId: this.edicionRegistroOficialId,
      fechaPublicacionEnSistema: this.fechaPublicacionEnSistema,
    };
  }
}

function normalizarTextoOpcional(valor: string | null): string | null {
  if (valor === null || estaTextoVacio(valor)) {
    return null;
  }
  return normalizarTexto(valor);
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function esContenidoValido(valor: unknown): valor is string[] {
  return (
    Array.isArray(valor) &&
    valor.every((elemento) => typeof elemento === 'string')
  );
}

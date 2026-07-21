import { EstadoResolucionFuente } from '../enums/EstadoResolucionFuente';
import { estaTextoVacio, normalizarTexto } from '../../compartido/validaciones/texto';
import { normalizarFechaCalendario } from '../../compartido/fechas/fecha-calendario';

export interface EdicionRegistroOficialProps {
  id: string;
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: Date;
  urlPdf: string | null;
  estadoResolucionFuente: EstadoResolucionFuente;
}

/**
 * Clave lógica de una edición del Registro Oficial. Identifica la edición
 * internamente; en el catálogo oficial se busca por tipo + número y la fecha
 * actúa como criterio de confianza/verificación.
 */
export type ClaveEdicionRegistroOficial = {
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: Date;
};

const ESTADOS_CON_FUENTE: ReadonlyArray<EstadoResolucionFuente> = [
  EstadoResolucionFuente.RESUELTA,
  EstadoResolucionFuente.MANUAL,
];

/**
 * Edición/publicación específica del Registro Oficial (p. ej. SRO 500 del
 * 2026-05-04). Es la dueña de la URL del PDF oficial (`urlPdf`): varias
 * normas apuntan a la misma edición y la fuente se resuelve/corrige una sola
 * vez por edición, nunca norma por norma.
 */
export class EdicionRegistroOficial {
  readonly id: string;
  readonly tipoPublicacionRegistroOficial: string;
  readonly numeroPublicacionRegistroOficial: number;
  readonly fechaPublicacionOficial: Date;
  readonly urlPdf: string | null;
  readonly estadoResolucionFuente: EstadoResolucionFuente;

  constructor(props: EdicionRegistroOficialProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la edición no puede estar vacío');
    }
    if (estaTextoVacio(props.tipoPublicacionRegistroOficial)) {
      throw new Error(
        'tipoPublicacionRegistroOficial de la edición no puede estar vacío',
      );
    }
    if (
      !Number.isInteger(props.numeroPublicacionRegistroOficial) ||
      props.numeroPublicacionRegistroOficial <= 0
    ) {
      throw new Error(
        'numeroPublicacionRegistroOficial de la edición debe ser un entero positivo',
      );
    }
    if (!esFechaValida(props.fechaPublicacionOficial)) {
      throw new Error(
        'fechaPublicacionOficial de la edición debe ser una fecha válida',
      );
    }

    const urlPdf = normalizarUrlOpcional(props.urlPdf);
    if (urlPdf !== null && !esUrlValida(urlPdf)) {
      throw new Error('urlPdf de la edición debe ser una URL válida');
    }

    const tieneEstadoConFuente = ESTADOS_CON_FUENTE.includes(
      props.estadoResolucionFuente,
    );
    if (tieneEstadoConFuente && urlPdf === null) {
      throw new Error(
        `Una edición ${props.estadoResolucionFuente} debe tener urlPdf`,
      );
    }
    if (!tieneEstadoConFuente && urlPdf !== null) {
      throw new Error(
        `Una edición ${props.estadoResolucionFuente} no puede tener urlPdf`,
      );
    }

    this.id = normalizarTexto(props.id);
    this.tipoPublicacionRegistroOficial = normalizarTexto(
      props.tipoPublicacionRegistroOficial,
    );
    this.numeroPublicacionRegistroOficial =
      props.numeroPublicacionRegistroOficial;
    this.fechaPublicacionOficial = normalizarFechaCalendario(
      props.fechaPublicacionOficial,
    );
    this.urlPdf = urlPdf;
    this.estadoResolucionFuente = props.estadoResolucionFuente;
  }

  /** La publicación de normas exige fuente RESUELTA o MANUAL con urlPdf. */
  tieneFuenteValidaParaPublicacion(): boolean {
    return (
      this.urlPdf !== null &&
      ESTADOS_CON_FUENTE.includes(this.estadoResolucionFuente)
    );
  }

  /** La resolución automática nunca sobrescribe una fuente ya establecida. */
  admiteResolucionAutomatica(): boolean {
    return !ESTADOS_CON_FUENTE.includes(this.estadoResolucionFuente);
  }

  /** Coincidencia única y confiable en el catálogo del Registro Oficial. */
  resolverFuente(urlPdf: string): EdicionRegistroOficial {
    this.asegurarResolucionAutomaticaPermitida();
    return this.conFuente(urlPdf, EstadoResolucionFuente.RESUELTA);
  }

  /** Cero coincidencias en el catálogo del Registro Oficial. */
  marcarFuenteNoEncontrada(): EdicionRegistroOficial {
    this.asegurarResolucionAutomaticaPermitida();
    return this.conFuente(null, EstadoResolucionFuente.NO_ENCONTRADA);
  }

  /** Múltiples URLs posibles o discrepancia ambigua: no se elige arbitrariamente. */
  marcarFuenteConflictiva(): EdicionRegistroOficial {
    this.asegurarResolucionAutomaticaPermitida();
    return this.conFuente(null, EstadoResolucionFuente.CONFLICTIVA);
  }

  /**
   * Corrección manual del editor: aplica a la edición completa y por lo tanto
   * a todas las normas asociadas. Es la única vía que sobrescribe una fuente
   * ya establecida.
   */
  corregirFuenteManualmente(urlPdf: string): EdicionRegistroOficial {
    return this.conFuente(urlPdf, EstadoResolucionFuente.MANUAL);
  }

  private asegurarResolucionAutomaticaPermitida(): void {
    if (!this.admiteResolucionAutomatica()) {
      throw new Error(
        'La resolución automática no puede sobrescribir una fuente RESUELTA o MANUAL',
      );
    }
  }

  private conFuente(
    urlPdf: string | null,
    estadoResolucionFuente: EstadoResolucionFuente,
  ): EdicionRegistroOficial {
    return new EdicionRegistroOficial({
      id: this.id,
      tipoPublicacionRegistroOficial: this.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial: this.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: this.fechaPublicacionOficial,
      urlPdf,
      estadoResolucionFuente,
    });
  }
}

function normalizarUrlOpcional(valor: string | null): string | null {
  if (valor === null || estaTextoVacio(valor)) {
    return null;
  }
  return normalizarTexto(valor);
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function esUrlValida(valor: string): boolean {
  try {
    new URL(valor);
    return true;
  } catch {
    return false;
  }
}

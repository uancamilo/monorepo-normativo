import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
} from '@normativo/dominio';
import {
  armarEdicionesRegistroOficial,
  EdicionRegistroOficialProyectada,
} from './EdicionRegistroOficialAsociada';

/**
 * Contrato editorial de una norma: datos jurídicos/editoriales y su colección
 * canónica de ediciones del Registro Oficial (principal + cambios). No incluye
 * señales técnicas de ingesta (advertencias, metadata o métricas de lote). La
 * norma no expone campos singulares de edición ni fuente propia: toda la
 * trazabilidad al Registro Oficial sale de `edicionesRegistroOficial`.
 */
export type NormaEditorialConsultada = {
  id: string;
  estadoEditorial: EstadoEditorialNorma;
  estadoJuridico: EstadoNorma | null;
  tipoNorma: string;
  numero: string;
  titulo: string;
  institucionExpide: string;
  fechaExpedicion: string | null;
  /** Principal primero; cambios por fecha ascendente e id como desempate. */
  edicionesRegistroOficial: EdicionRegistroOficialProyectada[];
  /**
   * Estado de resolución de fuente de la edición PRINCIPAL. Solo se expone
   * durante la revisión editorial de una norma BORRADOR (nunca en PUBLICADA).
   */
  estadoResolucionFuente?: EstadoResolucionFuente | null;
  /** Referencia editorial mínima cuando la norma nació de ingesta RO. */
  origenRegistroOficial?: OrigenRegistroOficialNorma;
};

/**
 * Referencia mínima al origen en el Registro Oficial para que el editor
 * verifique visualmente la detección. La URL es la del resumen/índice mensual,
 * no la fuente de la norma.
 */
export type OrigenRegistroOficialNorma = {
  urlResumenMensualRegistroOficial: string;
  segmentoCrudo: string;
};

export type DetalleEditorialNorma = NormaEditorialConsultada & {
  contenido: string[];
  origenRegistroOficial?: OrigenRegistroOficialNorma;
};

export function armarNormaEditorialConsultada(
  norma: Norma,
  edicionPrincipal: EdicionRegistroOficial | null,
  edicionesCambio: EdicionRegistroOficial[] = [],
  origenRegistroOficial: OrigenRegistroOficialNorma | null = null,
): NormaEditorialConsultada {
  const principal = edicionPrincipalDeNorma(norma, edicionPrincipal);
  const vista: NormaEditorialConsultada = {
    id: norma.id,
    estadoEditorial: norma.estadoEditorial,
    estadoJuridico: norma.estadoJuridico,
    tipoNorma: norma.tipoNorma,
    numero: norma.numero ?? '',
    titulo: norma.titulo,
    institucionExpide: norma.institucionExpide,
    fechaExpedicion: formatearFecha(norma.fechaExpedicion),
    edicionesRegistroOficial: armarEdicionesRegistroOficial(
      principal,
      edicionesCambio,
    ),
  };
  if (norma.estadoEditorial === EstadoEditorialNorma.BORRADOR) {
    vista.estadoResolucionFuente =
      principal === null ? null : principal.estadoResolucionFuente;
  }
  if (origenRegistroOficial !== null) {
    vista.origenRegistroOficial = origenRegistroOficial;
  }
  return vista;
}

export function armarDetalleEditorialNorma(
  norma: Norma,
  edicionPrincipal: EdicionRegistroOficial | null,
  edicionesCambio: EdicionRegistroOficial[],
  origenRegistroOficial: OrigenRegistroOficialNorma | null,
): DetalleEditorialNorma {
  return {
    ...armarNormaEditorialConsultada(
      norma,
      edicionPrincipal,
      edicionesCambio,
      origenRegistroOficial,
    ),
    contenido: norma.contenido,
  };
}

/**
 * La edición principal solo cuenta si coincide con la FK interna de la norma:
 * una edición cargada que no sea su principal nunca se proyecta como tal.
 */
function edicionPrincipalDeNorma(
  norma: Norma,
  edicionPrincipal: EdicionRegistroOficial | null,
): EdicionRegistroOficial | null {
  if (
    edicionPrincipal === null ||
    norma.edicionRegistroOficialId !== edicionPrincipal.id
  ) {
    return null;
  }
  return edicionPrincipal;
}

function formatearFecha(fecha: Date | null): string | null {
  return fecha === null ? null : fecha.toISOString().slice(0, 10);
}

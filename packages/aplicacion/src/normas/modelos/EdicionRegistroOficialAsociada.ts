import {
  EdicionRegistroOficial,
  formatearFechaCalendario,
} from '@normativo/dominio';

/**
 * Tipo de relación entre una Norma y una edición del Registro Oficial. La
 * principal es la edición de la FK interna de Norma (la primera, donde nació
 * la publicación); los cambios son ediciones posteriores relacionadas con
 * reformas o correcciones, y viven en una tabla intermedia separada.
 */
export type TipoRelacionEdicionRegistroOficial = 'PRINCIPAL' | 'CAMBIO';

/**
 * Edición del Registro Oficial asociada a una norma junto con su tipo de
 * relación. Modelo explícito de aplicación: nunca es un modelo de Prisma.
 */
export type EdicionRegistroOficialAsociada = {
  tipoRelacion: TipoRelacionEdicionRegistroOficial;
  edicion: EdicionRegistroOficial;
};

/**
 * Proyección canónica de una edición asociada para las respuestas. La fuente
 * es la urlPdf de la edición (null mientras no esté resuelta). No expone
 * estado de resolución ni datos técnicos de ingesta.
 */
export type EdicionRegistroOficialProyectada = {
  tipoRelacion: TipoRelacionEdicionRegistroOficial;
  id: string;
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: string;
  fuente: string | null;
};

/**
 * Arma la colección canónica `edicionesRegistroOficial` de una norma:
 *
 * 1. la principal primero (si existe);
 * 2. los cambios ordenados por `fechaPublicacionOficial` ascendente;
 * 3. `id` ascendente como desempate.
 *
 * Una norma sin principal proyecta `[]` (los cambios sin principal no existen
 * como invariante y, defensivamente, tampoco se proyectan sin principal).
 */
export function armarEdicionesRegistroOficial(
  principal: EdicionRegistroOficial | null,
  cambios: EdicionRegistroOficial[],
): EdicionRegistroOficialProyectada[] {
  if (principal === null) {
    return [];
  }
  const cambiosOrdenados = [...cambios]
    .filter((cambio) => cambio.id !== principal.id)
    .sort(compararCambios);
  return [
    proyectar('PRINCIPAL', principal),
    ...cambiosOrdenados.map((cambio) => proyectar('CAMBIO', cambio)),
  ];
}

function compararCambios(
  a: EdicionRegistroOficial,
  b: EdicionRegistroOficial,
): number {
  const fechaA = a.fechaPublicacionOficial.getTime();
  const fechaB = b.fechaPublicacionOficial.getTime();
  if (fechaA !== fechaB) {
    return fechaA - fechaB;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

function proyectar(
  tipoRelacion: TipoRelacionEdicionRegistroOficial,
  edicion: EdicionRegistroOficial,
): EdicionRegistroOficialProyectada {
  return {
    tipoRelacion,
    id: edicion.id,
    tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
    numeroPublicacionRegistroOficial: edicion.numeroPublicacionRegistroOficial,
    fechaPublicacionOficial: formatearFechaCalendario(
      edicion.fechaPublicacionOficial,
    ),
    fuente: edicion.urlPdf,
  };
}

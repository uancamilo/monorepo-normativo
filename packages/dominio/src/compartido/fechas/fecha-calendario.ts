const PATRON_FECHA_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte el contrato externo YYYY-MM-DD en un Date canónico a medianoche
 * UTC. Rechaza formatos flexibles y fechas que JavaScript normalizaría de
 * forma silenciosa, como 2026-02-30.
 */
export function parsearFechaCalendario(valor: string): Date | null {
  if (typeof valor !== 'string') {
    return null;
  }
  const coincidencia = PATRON_FECHA_CALENDARIO.exec(valor);
  if (coincidencia === null) {
    return null;
  }

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const fecha = crearFechaUtc(anio, mes, dia);

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() + 1 !== mes ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

/** Normaliza un Date válido al día que representa en UTC. */
export function normalizarFechaCalendario(fecha: Date): Date {
  asegurarFechaValida(fecha);
  return crearFechaUtc(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth() + 1,
    fecha.getUTCDate(),
  );
}

/** Proyección estable del día calendario para contratos y claves lógicas. */
export function formatearFechaCalendario(fecha: Date): string {
  const normalizada = normalizarFechaCalendario(fecha);
  return [
    String(normalizada.getUTCFullYear()).padStart(4, '0'),
    String(normalizada.getUTCMonth() + 1).padStart(2, '0'),
    String(normalizada.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function crearFechaUtc(anio: number, mes: number, dia: number): Date {
  const fecha = new Date(0);
  fecha.setUTCFullYear(anio, mes - 1, dia);
  fecha.setUTCHours(0, 0, 0, 0);
  return fecha;
}

function asegurarFechaValida(fecha: Date): void {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new Error('La fecha calendario debe ser válida');
  }
}

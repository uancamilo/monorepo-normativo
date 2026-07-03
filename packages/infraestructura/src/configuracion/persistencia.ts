export type PersistenciaNormas = 'memoria' | 'prisma';

/**
 * Única semántica de PERSISTENCIA, compartida por el selector de módulo y la
 * validación de arranque: ausente cae a memoria (el arranque productivo exige
 * valor explícito aparte), y un valor desconocido siempre es error — nunca un
 * fallback silencioso a memoria.
 */
export function obtenerPersistenciaNormas(
  valor: string | undefined = process.env.PERSISTENCIA,
): PersistenciaNormas {
  if (valor === undefined || valor.trim().length === 0) {
    return 'memoria';
  }

  if (valor === 'memoria' || valor === 'prisma') {
    return valor;
  }

  throw new Error(
    `PERSISTENCIA tiene un valor desconocido: '${valor}' (se espera memoria o prisma)`,
  );
}

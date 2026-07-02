/**
 * Valida en runtime que un valor leído de la base de datos pertenezca al enum
 * de dominio esperado, en vez de castearlo a ciegas. Protege contra columnas
 * con valores inesperados (migraciones a medias, escrituras externas).
 */
export function asegurarValorEnum<T extends string>(
  valor: string,
  valoresValidos: ReadonlyArray<T>,
  contexto: { entidad: string; campo: string; id: string },
): T {
  if ((valoresValidos as ReadonlyArray<string>).includes(valor)) {
    return valor as T;
  }

  throw new Error(
    `Valor de enum inesperado en ${contexto.entidad}.${contexto.campo} ` +
      `(id ${contexto.id}): '${valor}' (se espera uno de: ${valoresValidos.join(', ')})`,
  );
}

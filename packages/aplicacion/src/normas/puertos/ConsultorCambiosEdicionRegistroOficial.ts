/**
 * Lectura en bloque de las ediciones de cambio asociadas a una o varias
 * normas. Existe como puerto propio (ISP): las consultas editoriales y de
 * contenido no necesitan la superficie de escritura de `RepositorioNormas`.
 *
 * Devuelve únicamente los ids de las ediciones de cambio por norma (la
 * principal es la FK interna de la norma). El consumidor hidrata las ediciones
 * con `RepositorioEdicionesRegistroOficial`. Nunca devuelve modelos de Prisma.
 * La variante por lista permite recuperar los cambios de muchas normas en una
 * sola consulta y evitar N+1 en `GET /normas`.
 */
export interface ConsultorCambiosEdicionRegistroOficial {
  buscarCambiosPorNormaId(normaId: string): Promise<string[]>;
  buscarCambiosPorNormaIds(
    normaIds: string[],
  ): Promise<Map<string, string[]>>;
}

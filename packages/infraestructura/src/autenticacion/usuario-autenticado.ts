/**
 * Identidad extraída de un token verificado. Solo identifica al usuario: los
 * permisos de negocio se resuelven con el Usuario del dominio, cargado por los
 * casos de uso desde RepositorioUsuarios. El rol del token es informativo.
 */
export interface UsuarioAutenticado {
  id: string;
  rol?: string;
}

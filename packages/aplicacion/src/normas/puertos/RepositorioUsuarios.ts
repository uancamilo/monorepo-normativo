import { Usuario } from '@normativo/dominio';

export interface RepositorioUsuarios {
  buscarPorId(id: string): Promise<Usuario | null>;
}

import { Norma } from '@normativo/dominio';

export interface RepositorioNormas {
  buscarPorId(id: string): Promise<Norma | null>;
  guardar(norma: Norma): Promise<void>;
}

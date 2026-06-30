import { Injectable } from '@nestjs/common';
import { Norma } from '@normativo/dominio';
import { RepositorioNormas } from '@normativo/aplicacion';

@Injectable()
export class RepositorioNormasEnMemoria implements RepositorioNormas {
  private readonly normasPorId = new Map<string, Norma>();

  async buscarPorId(id: string): Promise<Norma | null> {
    return this.normasPorId.get(id) ?? null;
  }

  async guardar(norma: Norma): Promise<void> {
    this.normasPorId.set(norma.id, norma);
  }
}

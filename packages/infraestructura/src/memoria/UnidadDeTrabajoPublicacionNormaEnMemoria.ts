import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
  RepositorioNormas,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { Norma } from '@normativo/dominio';

export class UnidadDeTrabajoPublicacionNormaEnMemoria
  implements UnidadDeTrabajoPublicacionNorma
{
  constructor(
    private readonly repositorioNormas: RepositorioNormas,
    private readonly publicadorEventosNormas: PublicadorEventosNormas,
  ) {}

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<void> {
    await this.repositorioNormas.guardar(normaPublicada);
    await this.publicadorEventosNormas.publicarNormaPublicada(evento);
  }
}

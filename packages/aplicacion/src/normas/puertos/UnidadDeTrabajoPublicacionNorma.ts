import { Norma } from '@normativo/dominio';
import { EventoNormaPublicada } from './PublicadorEventosNormas';

export interface UnidadDeTrabajoPublicacionNorma {
  guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<void>;
}

import { Injectable } from '@nestjs/common';
import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
} from '@normativo/aplicacion';

@Injectable()
export class PublicadorEventosNormasEnMemoria
  implements PublicadorEventosNormas
{
  private readonly _eventos: EventoNormaPublicada[] = [];

  async publicarNormaPublicada(evento: EventoNormaPublicada): Promise<void> {
    this._eventos.push(evento);
  }

  get eventos(): EventoNormaPublicada[] {
    return [...this._eventos];
  }
}

import { Injectable } from '@nestjs/common';
import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
} from '@normativo/aplicacion';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicadorEventosNormasPrisma
  implements PublicadorEventosNormas
{
  constructor(private readonly prisma: PrismaService) {}

  async publicarNormaPublicada(evento: EventoNormaPublicada): Promise<void> {
    await this.prisma.eventoNormaPublicada.create({
      data: {
        id: randomUUID(),
        normaId: evento.normaId,
        fechaPublicacionEnSistema: evento.fechaPublicacionEnSistema,
        tieneContenidoCompleto: evento.tieneContenidoCompleto,
      },
    });
  }
}

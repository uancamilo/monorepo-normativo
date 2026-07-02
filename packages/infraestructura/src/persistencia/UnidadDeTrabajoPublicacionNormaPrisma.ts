import { Injectable } from '@nestjs/common';
import {
  EventoNormaPublicada,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { Norma } from '@normativo/dominio';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { mapearNormaADataPrisma } from './mapeadores/mapearNorma';

@Injectable()
export class UnidadDeTrabajoPublicacionNormaPrisma
  implements UnidadDeTrabajoPublicacionNorma
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly generarEventoId: () => string = randomUUID,
  ) {}

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<void> {
    const { id: _id, ...datosNorma } = mapearNormaADataPrisma(normaPublicada);

    await this.prisma.$transaction(async (transaccion) => {
      // update (no upsert): publicar una norma inexistente debe fallar la
      // transacción completa en vez de crearla ya publicada.
      await transaccion.norma.update({
        where: { id: normaPublicada.id },
        data: datosNorma,
      });

      await transaccion.eventoNormaPublicada.create({
        data: {
          id: this.generarEventoId(),
          normaId: evento.normaId,
          fechaPublicacionEnSistema: evento.fechaPublicacionEnSistema,
          tieneContenidoCompleto: evento.tieneContenidoCompleto,
        },
      });
    });
  }
}

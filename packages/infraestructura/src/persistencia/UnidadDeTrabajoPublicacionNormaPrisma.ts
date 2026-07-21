import { Injectable } from '@nestjs/common';
import {
  EventoNormaPublicada,
  ResultadoGuardarPublicacion,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { Norma } from '@normativo/dominio';
import {
  EstadoEditorialNormaPrisma,
  EstadoResolucionFuentePrisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

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
  ): Promise<ResultadoGuardarPublicacion> {
    return this.prisma.$transaction(async (transaccion) => {
      // Transición condicionada que escribe únicamente el estado editorial y
      // la fecha de publicación: la copia leída por el caso de uso no pisa
      // correcciones editoriales concurrentes. Además de id + BORRADOR, la
      // condición exige atómicamente las precondiciones de publicación sobre
      // el estado persistido vigente: la validación previa del caso de uso
      // pudo quedar obsoleta si una modificación concurrente vació un campo
      // obligatorio o reasignó la norma a una edición sin fuente publicable.
      const resultado = await transaccion.norma.updateMany({
        where: {
          id: normaPublicada.id,
          estadoEditorial: EstadoEditorialNormaPrisma.BORRADOR,
          tipoNorma: { not: '' },
          titulo: { not: '' },
          institucionExpide: { not: '' },
          estadoJuridico: { not: null },
          edicionRegistroOficial: {
            is: {
              urlPdf: { not: null },
              estadoResolucionFuente: {
                in: [
                  EstadoResolucionFuentePrisma.MANUAL,
                  EstadoResolucionFuentePrisma.RESUELTA,
                ],
              },
            },
          },
        },
        data: {
          estadoEditorial: EstadoEditorialNormaPrisma.PUBLICADA,
          fechaPublicacionEnSistema: evento.fechaPublicacionEnSistema,
        },
      });

      // Cero filas: se clasifica el conflicto dentro de la misma transacción
      // y no se inserta evento. Ambos desenlaces son conflictos esperados y
      // se reportan tipados, sin P2002 ni detalles de campo (la validación
      // normal pertenece a dominio/aplicación).
      if (resultado.count === 0) {
        const fila = await transaccion.norma.findUnique({
          where: { id: normaPublicada.id },
          select: { estadoEditorial: true },
        });
        if (
          fila === null ||
          fila.estadoEditorial === EstadoEditorialNormaPrisma.PUBLICADA
        ) {
          return {
            publicada: false as const,
            razon: 'NORMA_YA_PUBLICADA' as const,
          };
        }
        return {
          publicada: false as const,
          razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE' as const,
        };
      }

      // El evento queda en la misma transacción y refleja el contenido
      // persistido vigente (no la copia leída, que pudo quedar obsoleta si
      // el contenido cambió concurrentemente). Si su inserción falla por una
      // causa inesperada, la publicación se revierte y el error se propaga
      // (no se oculta como conflicto normal).
      const vigente = await transaccion.norma.findUniqueOrThrow({
        where: { id: normaPublicada.id },
        select: { contenido: true },
      });
      const tieneContenidoCompleto = vigente.contenido.length > 0;
      await transaccion.eventoNormaPublicada.create({
        data: {
          id: this.generarEventoId(),
          normaId: evento.normaId,
          fechaPublicacionEnSistema: evento.fechaPublicacionEnSistema,
          tieneContenidoCompleto,
        },
      });

      return { publicada: true as const, tieneContenidoCompleto };
    });
  }
}

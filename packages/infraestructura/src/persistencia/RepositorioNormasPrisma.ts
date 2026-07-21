import { Injectable } from '@nestjs/common';
import { EstadoEditorialNorma, Norma } from '@normativo/dominio';
import {
  ConsultorCambiosEdicionRegistroOficial,
  FiltroListarNormas,
  RepositorioNormas,
  ResultadoActualizarNormaBorrador,
  ResultadoReemplazarEdicionPrincipal,
} from '@normativo/aplicacion';
import { EstadoEditorialNormaPrisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapearDatosEditorialesNormaPrisma,
  mapearNormaADataPrisma,
  mapearNormaDesdePrisma,
} from './mapeadores/mapearNorma';

@Injectable()
export class RepositorioNormasPrisma
  implements RepositorioNormas, ConsultorCambiosEdicionRegistroOficial
{
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Norma | null> {
    const norma = await this.prisma.norma.findUnique({
      where: { id },
    });

    return norma === null ? null : mapearNormaDesdePrisma(norma);
  }

  async listar(filtro: FiltroListarNormas = {}): Promise<Norma[]> {
    const normas = await this.prisma.norma.findMany({
      where:
        filtro.estadoEditorial === undefined
          ? {}
          : {
              estadoEditorial:
                filtro.estadoEditorial as EstadoEditorialNormaPrisma,
            },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return normas.map(mapearNormaDesdePrisma);
  }

  async guardar(norma: Norma): Promise<void> {
    await this.prisma.norma.upsert({
      where: { id: norma.id },
      create: mapearNormaADataPrisma(norma),
      update: mapearNormaADataPrisma(norma),
    });
  }

  async actualizarBorrador(
    norma: Norma,
  ): Promise<ResultadoActualizarNormaBorrador> {
    // Escritura condicionada por id + BORRADOR (sin upsert): una corrección
    // obsoleta nunca revierte una norma publicada concurrentemente y solo se
    // escriben los datos editoriales, nunca estado/edición/fecha.
    const resultado = await this.prisma.norma.updateMany({
      where: {
        id: norma.id,
        estadoEditorial: EstadoEditorialNormaPrisma.BORRADOR,
      },
      data: mapearDatosEditorialesNormaPrisma(norma),
    });

    if (resultado.count === 0) {
      const existe = await this.prisma.norma.findUnique({
        where: { id: norma.id },
        select: { id: true },
      });
      return existe === null
        ? { actualizada: false, razon: 'NORMA_NO_ENCONTRADA' }
        : { actualizada: false, razon: 'NORMA_NO_EDITABLE' };
    }

    return { actualizada: true, norma: await this.buscarPersistida(norma.id) };
  }

  async buscarCambiosPorNormaId(normaId: string): Promise<string[]> {
    const asociaciones =
      await this.prisma.normaEdicionRegistroOficialCambio.findMany({
        where: { normaId },
        select: { edicionRegistroOficialId: true },
      });
    return asociaciones.map((asociacion) => asociacion.edicionRegistroOficialId);
  }

  async buscarCambiosPorNormaIds(
    normaIds: string[],
  ): Promise<Map<string, string[]>> {
    const resultado = new Map(normaIds.map((normaId) => [normaId, [] as string[]]));
    if (normaIds.length === 0) {
      return resultado;
    }
    const asociaciones =
      await this.prisma.normaEdicionRegistroOficialCambio.findMany({
        where: { normaId: { in: normaIds } },
        select: { normaId: true, edicionRegistroOficialId: true },
      });
    for (const asociacion of asociaciones) {
      resultado.get(asociacion.normaId)?.push(
        asociacion.edicionRegistroOficialId,
      );
    }
    return resultado;
  }

  async reemplazarEdicionPrincipalSiEstado(
    normaId: string,
    nuevaEdicionPrincipalId: string,
    estadoEditorialEsperado: EstadoEditorialNorma,
  ): Promise<ResultadoReemplazarEdicionPrincipal> {
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.norma.findUnique({ where: { id: normaId } });
      if (actual === null) {
        return { actualizada: false, razon: 'NORMA_NO_ENCONTRADA' };
      }
      if (actual.estadoEditorial !== estadoEditorialEsperado) {
        return {
          actualizada: false,
          razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
        };
      }

      const principalActual = actual.edicionRegistroOficialId;
      if (principalActual === nuevaEdicionPrincipalId) {
        await tx.normaEdicionRegistroOficialCambio.deleteMany({
          where: { normaId, edicionRegistroOficialId: nuevaEdicionPrincipalId },
        });
      } else {
        // La condición incluye la principal leída: dos reemplazos concurrentes
        // no pueden conservar dos antiguas distintas ni pisarse silenciosamente.
        const actualizacion = await tx.norma.updateMany({
          where: {
            id: normaId,
            estadoEditorial:
              estadoEditorialEsperado as EstadoEditorialNormaPrisma,
            edicionRegistroOficialId: principalActual,
          },
          data: { edicionRegistroOficialId: nuevaEdicionPrincipalId },
        });
        if (actualizacion.count === 0) {
          return {
            actualizada: false,
            razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
          };
        }

        await tx.normaEdicionRegistroOficialCambio.deleteMany({
          where: { normaId, edicionRegistroOficialId: nuevaEdicionPrincipalId },
        });
        if (principalActual !== null) {
          await tx.normaEdicionRegistroOficialCambio.createMany({
            data: {
              normaId,
              edicionRegistroOficialId: principalActual,
            },
            skipDuplicates: true,
          });
        }
      }

      const [persistida, cambios] = await Promise.all([
        tx.norma.findUniqueOrThrow({ where: { id: normaId } }),
        tx.normaEdicionRegistroOficialCambio.findMany({
          where: { normaId },
          select: { edicionRegistroOficialId: true },
        }),
      ]);
      return {
        actualizada: true,
        norma: mapearNormaDesdePrisma(persistida),
        edicionesCambioIds: cambios.map(
          (cambio) => cambio.edicionRegistroOficialId,
        ),
      };
    });
  }

  private async buscarPersistida(id: string): Promise<Norma> {
    const persistida = await this.prisma.norma.findUnique({ where: { id } });
    if (persistida === null) {
      throw new Error(
        `La norma ${id} desapareció después de una actualización condicionada`,
      );
    }
    return mapearNormaDesdePrisma(persistida);
  }
}

import { Injectable } from '@nestjs/common';
import {
  ClaveEdicionRegistroOficial,
  EdicionRegistroOficial,
  EstadoResolucionFuente,
  normalizarFechaCalendario,
} from '@normativo/dominio';
import {
  RepositorioEdicionesRegistroOficial,
  ResultadoCrearORecuperarEdicionRegistroOficial,
  ResultadoGuardarResolucionFuenteRegistroOficial,
} from '@normativo/aplicacion';
import { EstadoResolucionFuentePrisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapearEdicionRegistroOficialADataPrisma,
  mapearEdicionRegistroOficialDesdePrisma,
} from './mapeadores/mapearEdicionRegistroOficial';

@Injectable()
export class RepositorioEdicionesRegistroOficialPrisma
  implements RepositorioEdicionesRegistroOficial
{
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<EdicionRegistroOficial | null> {
    const edicion = await this.prisma.edicionRegistroOficial.findUnique({
      where: { id },
    });
    return edicion === null
      ? null
      : mapearEdicionRegistroOficialDesdePrisma(edicion);
  }

  async buscarPorIds(ids: string[]): Promise<EdicionRegistroOficial[]> {
    if (ids.length === 0) {
      return [];
    }
    const ediciones = await this.prisma.edicionRegistroOficial.findMany({
      where: { id: { in: ids } },
    });
    return ediciones.map(mapearEdicionRegistroOficialDesdePrisma);
  }

  async buscarPorClave(
    clave: ClaveEdicionRegistroOficial,
  ): Promise<EdicionRegistroOficial | null> {
    const edicion = await this.prisma.edicionRegistroOficial.findUnique({
      where: {
        tipoPublicacionRegistroOficial_numeroPublicacionRegistroOficial_fechaPublicacionOficial:
          {
            tipoPublicacionRegistroOficial:
              clave.tipoPublicacionRegistroOficial,
            numeroPublicacionRegistroOficial:
              clave.numeroPublicacionRegistroOficial,
            fechaPublicacionOficial: normalizarFechaCalendario(
              clave.fechaPublicacionOficial,
            ),
          },
      },
    });
    return edicion === null
      ? null
      : mapearEdicionRegistroOficialDesdePrisma(edicion);
  }

  async listar(): Promise<EdicionRegistroOficial[]> {
    const ediciones = await this.prisma.edicionRegistroOficial.findMany({
      orderBy: [{ fechaPublicacionOficial: 'desc' }, { id: 'asc' }],
    });
    return ediciones.map(mapearEdicionRegistroOficialDesdePrisma);
  }

  async listarPorEstadoResolucionFuente(
    estados: EstadoResolucionFuente[],
  ): Promise<EdicionRegistroOficial[]> {
    const ediciones = await this.prisma.edicionRegistroOficial.findMany({
      where: {
        estadoResolucionFuente: {
          in: estados as unknown as EstadoResolucionFuentePrisma[],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return ediciones.map(mapearEdicionRegistroOficialDesdePrisma);
  }

  async crearORecuperar(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoCrearORecuperarEdicionRegistroOficial> {
    try {
      const creada = await this.prisma.edicionRegistroOficial.create({
        data: mapearEdicionRegistroOficialADataPrisma(edicion),
      });
      return {
        edicion: mapearEdicionRegistroOficialDesdePrisma(creada),
        esNueva: true,
      };
    } catch (error) {
      if (!esViolacionUnica(error)) {
        throw error;
      }

      // P2002 puede deberse también al id. Solo se considera una carrera
      // recuperable si la fila ganadora existe con la misma clave lógica.
      const existente = await this.buscarPorClave({
        tipoPublicacionRegistroOficial:
          edicion.tipoPublicacionRegistroOficial,
        numeroPublicacionRegistroOficial:
          edicion.numeroPublicacionRegistroOficial,
        fechaPublicacionOficial: edicion.fechaPublicacionOficial,
      });
      if (existente === null) {
        throw error;
      }
      return { edicion: existente, esNueva: false };
    }
  }

  async guardarResolucionSiPendiente(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoGuardarResolucionFuenteRegistroOficial> {
    const resultado = await this.prisma.edicionRegistroOficial.updateMany({
      where: {
        id: edicion.id,
        estadoResolucionFuente: EstadoResolucionFuentePrisma.PENDIENTE,
        urlPdf: null,
      },
      data: {
        urlPdf: edicion.urlPdf,
        estadoResolucionFuente:
          edicion.estadoResolucionFuente as EstadoResolucionFuentePrisma,
      },
    });

    if (resultado.count === 1) {
      return { actualizada: true, edicionActual: edicion };
    }

    return {
      actualizada: false,
      edicionActual: await this.buscarPorId(edicion.id),
    };
  }

  async guardar(edicion: EdicionRegistroOficial): Promise<void> {
    const data = mapearEdicionRegistroOficialADataPrisma(edicion);
    await this.prisma.edicionRegistroOficial.upsert({
      where: { id: edicion.id },
      create: data,
      update: data,
    });
  }
}

function esViolacionUnica(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

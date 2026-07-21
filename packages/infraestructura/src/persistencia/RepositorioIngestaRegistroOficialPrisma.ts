import { Injectable } from '@nestjs/common';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  IngestaRegistroOficialAPersistir,
  LoteIngestaRegistroOficial,
  OrigenRegistroOficialNorma,
  RepositorioIngestaRegistroOficial,
  ResultadoGuardarIngesta,
} from '@normativo/aplicacion';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapearNormaADataPrisma } from './mapeadores/mapearNorma';
import { mapearEdicionRegistroOficialADataPrisma } from './mapeadores/mapearEdicionRegistroOficial';
import {
  mapearEntradaDetectadaADataPrisma,
  mapearEntradaDetectadaDesdePrisma,
  mapearLoteIngestaADataPrisma,
  mapearLoteIngestaDesdePrisma,
} from './mapeadores/mapearIngestaRegistroOficial';

@Injectable()
export class RepositorioIngestaRegistroOficialPrisma
  implements RepositorioIngestaRegistroOficial
{
  constructor(private readonly prisma: PrismaService) {}

  async buscarLotePorPeriodo(
    periodoAnio: number,
    periodoMes: number,
  ): Promise<LoteIngestaRegistroOficial | null> {
    const lote = await this.prisma.loteIngestaRegistroOficial.findUnique({
      where: { periodoAnio_periodoMes: { periodoAnio, periodoMes } },
    });
    return lote === null ? null : mapearLoteIngestaDesdePrisma(lote);
  }

  async buscarLotePorId(
    id: string,
  ): Promise<LoteIngestaRegistroOficial | null> {
    const lote = await this.prisma.loteIngestaRegistroOficial.findUnique({
      where: { id },
    });
    return lote === null ? null : mapearLoteIngestaDesdePrisma(lote);
  }

  async listarLotes(): Promise<LoteIngestaRegistroOficial[]> {
    const lotes = await this.prisma.loteIngestaRegistroOficial.findMany({
      orderBy: [{ fechaEjecucion: 'desc' }, { id: 'asc' }],
    });
    return lotes.map(mapearLoteIngestaDesdePrisma);
  }

  async listarEntradasPorLoteId(
    loteId: string,
  ): Promise<EntradaDetectadaRegistroOficialAPersistir[]> {
    const entradas = await this.prisma.entradaDetectadaRegistroOficial.findMany({
      where: { loteId },
      orderBy: { posicion: 'asc' },
    });
    return entradas.map(mapearEntradaDetectadaDesdePrisma);
  }

  async buscarOrigenPorNormaId(
    normaId: string,
  ): Promise<OrigenRegistroOficialNorma | null> {
    const origenes = await this.buscarOrigenesPorNormaIds([normaId]);
    return origenes.get(normaId) ?? null;
  }

  async buscarOrigenesPorNormaIds(
    normaIds: string[],
  ): Promise<ReadonlyMap<string, OrigenRegistroOficialNorma>> {
    if (normaIds.length === 0) {
      return new Map();
    }
    const entradas = await this.prisma.entradaDetectadaRegistroOficial.findMany({
      where: { normaId: { in: [...new Set(normaIds)] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        normaId: true,
        segmentoCrudo: true,
        lote: { select: { urlResumenMensualRegistroOficial: true } },
      },
    });
    const origenes = new Map<string, OrigenRegistroOficialNorma>();
    for (const entrada of entradas) {
      if (origenes.has(entrada.normaId)) {
        continue;
      }
      origenes.set(entrada.normaId, {
        urlResumenMensualRegistroOficial:
          entrada.lote.urlResumenMensualRegistroOficial,
        segmentoCrudo: entrada.segmentoCrudo,
      });
    }
    return origenes;
  }

  async guardarIngesta(
    ingesta: IngestaRegistroOficialAPersistir,
  ): Promise<ResultadoGuardarIngesta> {
    const edicionesReasignadas = prepararReasignacionesInternas(
      ingesta.ediciones,
    );

    // Una P2002 por la triple revierte la transacción completa. Se recupera
    // la fila ganadora fuera de la transacción y se reintenta, conservando la
    // atomicidad de lote + ediciones propias + entradas + normas.
    for (;;) {
      try {
        await this.prisma.$transaction(async (transaccion) => {
          await transaccion.loteIngestaRegistroOficial.create({
            data: mapearLoteIngestaADataPrisma(ingesta.lote),
          });

          for (const edicion of ingesta.ediciones) {
            if (edicionesReasignadas.has(edicion.id)) {
              continue;
            }
            await transaccion.edicionRegistroOficial.create({
              data: mapearEdicionRegistroOficialADataPrisma(edicion),
            });
          }

          if (ingesta.normas.length > 0) {
            await transaccion.norma.createMany({
              data: ingesta.normas.map((norma) => {
                const data = mapearNormaADataPrisma(norma);
                if (data.edicionRegistroOficialId === null) {
                  return data;
                }
                return {
                  ...data,
                  edicionRegistroOficialId: resolverIdReasignado(
                    data.edicionRegistroOficialId,
                    edicionesReasignadas,
                  ),
                };
              }),
            });
          }
          if (ingesta.entradas.length > 0) {
            await transaccion.entradaDetectadaRegistroOficial.createMany({
              data: ingesta.entradas.map(mapearEntradaDetectadaADataPrisma),
            });
          }
        });
        return { exitoso: true };
      } catch (error) {
        if (esViolacionUnicaDeLote(error)) {
          return { exitoso: false, razon: 'LOTE_YA_REGISTRADO' };
        }
        const recuperoGanadora = await this.recuperarEdicionesConcurrentes(
          error,
          ingesta.ediciones,
          edicionesReasignadas,
        );
        if (!recuperoGanadora) {
          throw error;
        }
      }
    }
  }

  private async recuperarEdicionesConcurrentes(
    error: unknown,
    ediciones: IngestaRegistroOficialAPersistir['ediciones'],
    edicionesReasignadas: Map<string, string>,
  ): Promise<boolean> {
    if (!esViolacionUnica(error)) {
      return false;
    }

    let recuperoAlguna = false;
    for (const edicion of ediciones) {
      if (edicionesReasignadas.has(edicion.id)) {
        continue;
      }
      const existente = await this.prisma.edicionRegistroOficial.findUnique({
        where: {
          tipoPublicacionRegistroOficial_numeroPublicacionRegistroOficial_fechaPublicacionOficial:
            {
              tipoPublicacionRegistroOficial:
                edicion.tipoPublicacionRegistroOficial,
              numeroPublicacionRegistroOficial:
                edicion.numeroPublicacionRegistroOficial,
              fechaPublicacionOficial: edicion.fechaPublicacionOficial,
            },
        },
        select: { id: true },
      });
      if (existente !== null) {
        edicionesReasignadas.set(edicion.id, existente.id);
        recuperoAlguna = true;
      }
    }
    return recuperoAlguna;
  }
}

function prepararReasignacionesInternas(
  ediciones: IngestaRegistroOficialAPersistir['ediciones'],
): Map<string, string> {
  const primerIdPorClave = new Map<string, string>();
  const reasignadas = new Map<string, string>();
  for (const edicion of ediciones) {
    const clave = [
      edicion.tipoPublicacionRegistroOficial,
      edicion.numeroPublicacionRegistroOficial,
      edicion.fechaPublicacionOficial.toISOString(),
    ].join('\u0000');
    const primerId = primerIdPorClave.get(clave);
    if (primerId === undefined) {
      primerIdPorClave.set(clave, edicion.id);
    } else {
      reasignadas.set(edicion.id, primerId);
    }
  }
  return reasignadas;
}

function resolverIdReasignado(
  idOriginal: string,
  reasignadas: Map<string, string>,
): string {
  let actual = idOriginal;
  const visitados = new Set<string>();
  while (!visitados.has(actual)) {
    visitados.add(actual);
    const siguiente = reasignadas.get(actual);
    if (siguiente === undefined || siguiente === actual) {
      break;
    }
    actual = siguiente;
  }
  return actual;
}

function esViolacionUnicaDeLote(error: unknown): boolean {
  const posible = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown } };
      };
    };
  } | null;

  if (posible === null || posible.code !== 'P2002') {
    return false;
  }

  const objetivo =
    posible.meta?.target ??
    posible.meta?.driverAdapterError?.cause?.constraint?.fields;
  const columnas = Array.isArray(objetivo)
    ? objetivo.map(String)
    : [String(objetivo ?? '')];

  return columnas.some(
    (columna) =>
      columna.includes('periodo_anio') ||
      columna.includes('periodoAnio') ||
      columna.includes('periodo_mes') ||
      columna.includes('periodoMes'),
  );
}

function esViolacionUnica(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

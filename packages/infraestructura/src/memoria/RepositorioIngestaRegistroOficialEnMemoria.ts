import { Injectable } from '@nestjs/common';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  IngestaRegistroOficialAPersistir,
  LoteIngestaRegistroOficial,
  OrigenRegistroOficialNorma,
  RepositorioEdicionesRegistroOficial,
  RepositorioIngestaRegistroOficial,
  RepositorioNormas,
  ResultadoGuardarIngesta,
} from '@normativo/aplicacion';

/**
 * Adaptador en memoria del puerto de ingesta del Registro Oficial (Fase 5A).
 * Comparte los repositorios de normas y ediciones en memoria para que lo
 * creado por ingesta sea visible en los casos de uso de normas/ediciones.
 */
@Injectable()
export class RepositorioIngestaRegistroOficialEnMemoria
  implements RepositorioIngestaRegistroOficial
{
  private readonly lotesPorId = new Map<string, LoteIngestaRegistroOficial>();
  private readonly lotesPorPeriodo = new Map<
    string,
    LoteIngestaRegistroOficial
  >();
  private readonly entradas: EntradaDetectadaRegistroOficialAPersistir[] = [];

  constructor(
    private readonly repositorioNormas: RepositorioNormas,
    private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial,
  ) {}

  async buscarLotePorPeriodo(
    periodoAnio: number,
    periodoMes: number,
  ): Promise<LoteIngestaRegistroOficial | null> {
    return this.lotesPorPeriodo.get(clavePeriodo(periodoAnio, periodoMes)) ?? null;
  }

  async buscarLotePorId(
    id: string,
  ): Promise<LoteIngestaRegistroOficial | null> {
    return this.lotesPorId.get(id) ?? null;
  }

  async listarLotes(): Promise<LoteIngestaRegistroOficial[]> {
    return [...this.lotesPorId.values()].sort(
      (a, b) =>
        b.fechaEjecucion.getTime() - a.fechaEjecucion.getTime() ||
        a.id.localeCompare(b.id),
    );
  }

  async listarEntradasPorLoteId(
    loteId: string,
  ): Promise<EntradaDetectadaRegistroOficialAPersistir[]> {
    return this.entradas
      .filter((entrada) => entrada.loteId === loteId)
      .sort((a, b) => a.posicion - b.posicion);
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
    const idsSolicitados = new Set(normaIds);
    const origenes = new Map<string, OrigenRegistroOficialNorma>();
    for (const entrada of this.entradas) {
      if (
        !idsSolicitados.has(entrada.normaId) ||
        origenes.has(entrada.normaId)
      ) {
        continue;
      }
      const lote = this.lotesPorId.get(entrada.loteId);
      if (lote === undefined) {
        continue;
      }
      origenes.set(entrada.normaId, {
        urlResumenMensualRegistroOficial:
          lote.urlResumenMensualRegistroOficial,
        segmentoCrudo: entrada.segmentoCrudo,
      });
    }
    return origenes;
  }

  async guardarIngesta(
    ingesta: IngestaRegistroOficialAPersistir,
  ): Promise<ResultadoGuardarIngesta> {
    // Garantía equivalente al UNIQUE del período en Prisma:
    // la verificación y la escritura ocurren sin puntos de suspensión entre
    // medio, así que no hay carrera dentro del mismo proceso.
    const periodo = clavePeriodo(
      ingesta.lote.periodoAnio,
      ingesta.lote.periodoMes,
    );
    if (
      this.lotesPorPeriodo.has(periodo)
    ) {
      return { exitoso: false, razon: 'LOTE_YA_REGISTRADO' };
    }

    this.lotesPorId.set(ingesta.lote.id, ingesta.lote);
    this.lotesPorPeriodo.set(periodo, ingesta.lote);
    this.entradas.push(...ingesta.entradas);

    // Reconciliación por clave lógica (equivalente al UNIQUE de Prisma): si
    // ya existe una edición con la misma clave se reutiliza, reasignando las
    // normas del lote, sin duplicarla ni tocar su urlPdf.
    const edicionesReasignadas = new Map<string, string>();
    for (const edicion of ingesta.ediciones) {
      const persistida = await this.repositorioEdiciones.crearORecuperar(edicion);
      if (persistida.edicion.id !== edicion.id) {
        edicionesReasignadas.set(edicion.id, persistida.edicion.id);
      }
    }

    for (const norma of ingesta.normas) {
      const reasignada =
        norma.edicionRegistroOficialId === null
          ? undefined
          : edicionesReasignadas.get(norma.edicionRegistroOficialId);
      await this.repositorioNormas.guardar(
        reasignada === undefined
          ? norma
          : norma.asociarEdicionRegistroOficial(reasignada),
      );
    }
    return { exitoso: true };
  }
}

function clavePeriodo(periodoAnio: number, periodoMes: number): string {
  return `${periodoAnio}-${periodoMes}`;
}

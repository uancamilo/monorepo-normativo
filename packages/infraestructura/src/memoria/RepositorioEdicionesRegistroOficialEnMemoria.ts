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

@Injectable()
export class RepositorioEdicionesRegistroOficialEnMemoria
  implements RepositorioEdicionesRegistroOficial
{
  private readonly edicionesPorId = new Map<string, EdicionRegistroOficial>();

  async buscarPorId(id: string): Promise<EdicionRegistroOficial | null> {
    return this.edicionesPorId.get(id) ?? null;
  }

  async buscarPorIds(ids: string[]): Promise<EdicionRegistroOficial[]> {
    return ids
      .map((id) => this.edicionesPorId.get(id))
      .filter(
        (edicion): edicion is EdicionRegistroOficial => edicion !== undefined,
      );
  }

  async buscarPorClave(
    clave: ClaveEdicionRegistroOficial,
  ): Promise<EdicionRegistroOficial | null> {
    for (const edicion of this.edicionesPorId.values()) {
      if (coincideClave(edicion, clave)) {
        return edicion;
      }
    }
    return null;
  }

  async listar(): Promise<EdicionRegistroOficial[]> {
    return [...this.edicionesPorId.values()].sort(
      (a, b) => b.fechaPublicacionOficial.getTime() - a.fechaPublicacionOficial.getTime(),
    );
  }

  async listarPorEstadoResolucionFuente(
    estados: EstadoResolucionFuente[],
  ): Promise<EdicionRegistroOficial[]> {
    return [...this.edicionesPorId.values()].filter((edicion) =>
      estados.includes(edicion.estadoResolucionFuente),
    );
  }

  async crearORecuperar(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoCrearORecuperarEdicionRegistroOficial> {
    const existente = buscarPorClaveEnColeccion(
      this.edicionesPorId.values(),
      edicion,
    );
    if (existente !== null) {
      return { edicion: existente, esNueva: false };
    }
    this.edicionesPorId.set(edicion.id, edicion);
    return { edicion, esNueva: true };
  }

  async guardarResolucionSiPendiente(
    edicion: EdicionRegistroOficial,
  ): Promise<ResultadoGuardarResolucionFuenteRegistroOficial> {
    const actual = this.edicionesPorId.get(edicion.id) ?? null;
    if (
      actual === null ||
      actual.estadoResolucionFuente !== EstadoResolucionFuente.PENDIENTE ||
      actual.urlPdf !== null
    ) {
      return { actualizada: false, edicionActual: actual };
    }
    this.edicionesPorId.set(edicion.id, edicion);
    return { actualizada: true, edicionActual: edicion };
  }

  async guardar(edicion: EdicionRegistroOficial): Promise<void> {
    this.edicionesPorId.set(edicion.id, edicion);
  }
}

function buscarPorClaveEnColeccion(
  ediciones: Iterable<EdicionRegistroOficial>,
  clave: ClaveEdicionRegistroOficial,
): EdicionRegistroOficial | null {
  for (const edicion of ediciones) {
    if (coincideClave(edicion, clave)) {
      return edicion;
    }
  }
  return null;
}

function coincideClave(
  edicion: EdicionRegistroOficial,
  clave: ClaveEdicionRegistroOficial,
): boolean {
  return (
    edicion.tipoPublicacionRegistroOficial ===
      clave.tipoPublicacionRegistroOficial &&
    edicion.numeroPublicacionRegistroOficial ===
      clave.numeroPublicacionRegistroOficial &&
    edicion.fechaPublicacionOficial.getTime() ===
      normalizarFechaCalendario(clave.fechaPublicacionOficial).getTime()
  );
}

import { Injectable } from '@nestjs/common';
import { EstadoEditorialNorma, Norma } from '@normativo/dominio';
import {
  ConsultorCambiosEdicionRegistroOficial,
  FiltroListarNormas,
  RepositorioNormas,
  ResultadoActualizarNormaBorrador,
  ResultadoReemplazarEdicionPrincipal,
} from '@normativo/aplicacion';

@Injectable()
export class RepositorioNormasEnMemoria
  implements RepositorioNormas, ConsultorCambiosEdicionRegistroOficial
{
  private readonly normasPorId = new Map<string, Norma>();
  private readonly cambiosPorNormaId = new Map<string, Set<string>>();

  async buscarPorId(id: string): Promise<Norma | null> {
    return this.normasPorId.get(id) ?? null;
  }

  async listar(filtro: FiltroListarNormas = {}): Promise<Norma[]> {
    const normas = [...this.normasPorId.values()];
    if (filtro.estadoEditorial === undefined) {
      return normas;
    }
    return normas.filter(
      (norma) => norma.estadoEditorial === filtro.estadoEditorial,
    );
  }

  async guardar(norma: Norma): Promise<void> {
    this.normasPorId.set(norma.id, norma);
  }

  async actualizarBorrador(
    norma: Norma,
  ): Promise<ResultadoActualizarNormaBorrador> {
    const actual = this.normasPorId.get(norma.id);
    if (actual === undefined) {
      return { actualizada: false, razon: 'NORMA_NO_ENCONTRADA' };
    }
    // El estado se verifica dentro de la operación de persistencia: una
    // corrección obsoleta nunca revierte una norma ya publicada.
    if (actual.estaPublicada()) {
      return { actualizada: false, razon: 'NORMA_NO_EDITABLE' };
    }
    // Aplica solo los datos editoriales sobre el estado actual persistido;
    // estado editorial, edición y fecha de publicación no se tocan.
    const persistida = actual.actualizarDatosEditoriales({
      numero: norma.numero,
      titulo: norma.titulo,
      contenido: norma.contenido,
      tipoNorma: norma.tipoNorma,
      institucionExpide: norma.institucionExpide,
      estadoJuridico: norma.estadoJuridico,
      fechaExpedicion: norma.fechaExpedicion,
    });
    this.normasPorId.set(persistida.id, persistida);
    return { actualizada: true, norma: persistida };
  }

  async buscarCambiosPorNormaId(normaId: string): Promise<string[]> {
    return [...(this.cambiosPorNormaId.get(normaId) ?? [])];
  }

  async buscarCambiosPorNormaIds(
    normaIds: string[],
  ): Promise<Map<string, string[]>> {
    return new Map(
      normaIds.map((normaId) => [
        normaId,
        [...(this.cambiosPorNormaId.get(normaId) ?? [])],
      ]),
    );
  }

  async reemplazarEdicionPrincipalSiEstado(
    normaId: string,
    nuevaEdicionPrincipalId: string,
    estadoEditorialEsperado: EstadoEditorialNorma,
  ): Promise<ResultadoReemplazarEdicionPrincipal> {
    const actual = this.normasPorId.get(normaId);
    if (actual === undefined) {
      return { actualizada: false, razon: 'NORMA_NO_ENCONTRADA' };
    }
    if (actual.estadoEditorial !== estadoEditorialEsperado) {
      return {
        actualizada: false,
        razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
      };
    }
    const cambios = new Set(this.cambiosPorNormaId.get(normaId) ?? []);
    const principalActual = actual.edicionRegistroOficialId;

    if (principalActual === nuevaEdicionPrincipalId) {
      // Repara defensivamente una asociación inválida heredada: la principal
      // nunca puede aparecer también como cambio.
      cambios.delete(nuevaEdicionPrincipalId);
      this.cambiosPorNormaId.set(normaId, cambios);
      return {
        actualizada: true,
        norma: actual,
        edicionesCambioIds: [...cambios],
      };
    }

    if (principalActual !== null) {
      cambios.add(principalActual);
    }
    cambios.delete(nuevaEdicionPrincipalId);

    const persistida = actual.asociarEdicionRegistroOficial(
      nuevaEdicionPrincipalId,
    );
    this.normasPorId.set(persistida.id, persistida);
    this.cambiosPorNormaId.set(normaId, cambios);
    return {
      actualizada: true,
      norma: persistida,
      edicionesCambioIds: [...cambios],
    };
  }
}

import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { RepositorioIngestaRegistroOficial } from '../puertos/RepositorioIngestaRegistroOficial';
import {
  armarLoteIngestaConsultado,
  LoteIngestaRegistroOficialConsultado,
} from '../modelos/VistasIngestaRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

export type SolicitudConsultarLoteIngestaRegistroOficial = {
  usuarioAutenticadoId: string;
  loteId: string;
};

export type RazonConsultarLoteIngestaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'LOTE_NO_ENCONTRADO';

export type ResultadoConsultarLoteIngestaRegistroOficial =
  | {
      exitoso: true;
      lote: LoteIngestaRegistroOficialConsultado;
    }
  | {
      exitoso: false;
      razon: RazonConsultarLoteIngestaFallido;
    };

export interface DependenciasConsultarLoteIngestaRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioIngesta: RepositorioIngestaRegistroOficial;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
}

/**
 * Consulta de solo lectura de un lote completo con sus entradas detectadas
 * anidadas. No permite editar, descartar, fusionar ni publicar.
 */
export class ConsultarLoteIngestaRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioIngesta: RepositorioIngestaRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;

  constructor(dependencias: DependenciasConsultarLoteIngestaRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioIngesta = dependencias.repositorioIngesta;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
  }

  async ejecutar(
    solicitud: SolicitudConsultarLoteIngestaRegistroOficial,
  ): Promise<ResultadoConsultarLoteIngestaRegistroOficial> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.loteId)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeConsultarIngesta(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const lote = await this.repositorioIngesta.buscarLotePorId(
      solicitud.loteId.trim(),
    );
    if (lote === null) {
      return { exitoso: false, razon: 'LOTE_NO_ENCONTRADO' };
    }

    const entradas = await this.repositorioIngesta.listarEntradasPorLoteId(
      lote.id,
    );

    return {
      exitoso: true,
      lote: armarLoteIngestaConsultado(lote, entradas),
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

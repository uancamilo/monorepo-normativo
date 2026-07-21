import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { RepositorioIngestaRegistroOficial } from '../puertos/RepositorioIngestaRegistroOficial';
import {
  armarResumenLoteIngesta,
  ResumenLoteIngestaRegistroOficial,
} from '../modelos/VistasIngestaRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

export type SolicitudConsultarLotesIngestaRegistroOficial = {
  usuarioAutenticadoId: string;
};

export type RazonConsultarLotesIngestaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO';

export type ResultadoConsultarLotesIngestaRegistroOficial =
  | {
      exitoso: true;
      lotes: ResumenLoteIngestaRegistroOficial[];
    }
  | {
      exitoso: false;
      razon: RazonConsultarLotesIngestaFallido;
    };

export interface DependenciasConsultarLotesIngestaRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioIngesta: RepositorioIngestaRegistroOficial;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
}

/**
 * Consulta de solo lectura de lotes de ingesta. Las métricas se derivan de las
 * entradas detectadas, no de columnas persistidas.
 */
export class ConsultarLotesIngestaRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioIngesta: RepositorioIngestaRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;

  constructor(dependencias: DependenciasConsultarLotesIngestaRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioIngesta = dependencias.repositorioIngesta;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
  }

  async ejecutar(
    solicitud: SolicitudConsultarLotesIngestaRegistroOficial,
  ): Promise<ResultadoConsultarLotesIngestaRegistroOficial> {
    if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeConsultarIngesta(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const lotes = await this.repositorioIngesta.listarLotes();
    const resumenes: ResumenLoteIngestaRegistroOficial[] = [];
    for (const lote of lotes) {
      const entradas = await this.repositorioIngesta.listarEntradasPorLoteId(
        lote.id,
      );
      resumenes.push(armarResumenLoteIngesta(lote, entradas));
    }

    return {
      exitoso: true,
      lotes: resumenes,
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

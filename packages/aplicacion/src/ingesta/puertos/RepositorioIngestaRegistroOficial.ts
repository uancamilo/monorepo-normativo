import { EdicionRegistroOficial, Norma } from '@normativo/dominio';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  LoteIngestaRegistroOficial,
} from '../modelos/IngestaRegistroOficial';
import { ConsultorOrigenRegistroOficialNorma } from '../../normas/puertos/ConsultorOrigenRegistroOficialNorma';

export type IngestaRegistroOficialAPersistir = {
  lote: LoteIngestaRegistroOficial;
  entradas: EntradaDetectadaRegistroOficialAPersistir[];
  normas: Norma[];
  /**
   * Ediciones del Registro Oficial nuevas detectadas en este lote (las que no
   * existían por su clave lógica). El adaptador debe crearlas junto con lote,
   * entradas y normas; si otra ejecución concurrente ya creó una edición con
   * la misma clave, debe reutilizarla (reasignando la referencia de las
   * normas) en lugar de duplicarla o sobrescribir su urlPdf.
   */
  ediciones: EdicionRegistroOficial[];
};

export type ResultadoGuardarIngesta =
  | { exitoso: true }
  | {
      exitoso: false;
      /** Otro lote del mismo período mensual ya fue persistido. */
      razon: 'LOTE_YA_REGISTRADO';
    };

export interface RepositorioIngestaRegistroOficial
  extends ConsultorOrigenRegistroOficialNorma {
  buscarLotePorPeriodo(
    periodoAnio: number,
    periodoMes: number,
  ): Promise<LoteIngestaRegistroOficial | null>;
  buscarLotePorId(id: string): Promise<LoteIngestaRegistroOficial | null>;
  listarLotes(): Promise<LoteIngestaRegistroOficial[]>;
  listarEntradasPorLoteId(
    loteId: string,
  ): Promise<EntradaDetectadaRegistroOficialAPersistir[]>;
  /**
   * Persiste de forma atómica el lote, sus entradas y las normas borrador
   * creadas. Debe garantizar la unicidad del período mensual incluso ante
   * solicitudes concurrentes.
   */
  guardarIngesta(
    ingesta: IngestaRegistroOficialAPersistir,
  ): Promise<ResultadoGuardarIngesta>;
}

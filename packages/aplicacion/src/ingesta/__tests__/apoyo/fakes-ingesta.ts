import {
  EdicionRegistroOficial,
  EstadoResolucionFuente,
  Norma,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import { RepositorioUsuarios } from '../../../normas/puertos/RepositorioUsuarios';
import { GeneradorIds } from '../../../normas/puertos/GeneradorIds';
import {
  CatalogoRegistroOficial,
  ConsultaCatalogoRegistroOficial,
  EdicionCatalogoRegistroOficial,
  RazonConsultaCatalogoFallida,
  ResultadoConsultaCatalogoRegistroOficial,
} from '../../../normas/puertos/CatalogoRegistroOficial';
import {
  ConsultorEdicionesRegistroOficialPorLote,
  CursorEdicionesLote,
  ResultadoConsultaEdicionesLote,
} from '../../../normas/puertos/ConsultorEdicionesRegistroOficialPorLote';
import { RepositorioEdicionesRegistroOficialEnMemoriaFake } from '../../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';
import {
  IngestaRegistroOficialAPersistir,
  RepositorioIngestaRegistroOficial,
  ResultadoGuardarIngesta,
} from '../../puertos/RepositorioIngestaRegistroOficial';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  EntradaDetectadaResumen,
  LoteIngestaRegistroOficial,
} from '../../modelos/IngestaRegistroOficial';
import { OrigenRegistroOficialNorma } from '../../../normas/modelos/VistaEditorialNorma';
import { SolicitudIngerirResumenRegistroOficial } from '../../casos-uso/IngerirResumenRegistroOficial';

export class RepositorioUsuariosFake implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();
  /** Observabilidad de pruebas: ids consultados, en orden. */
  readonly busquedas: string[] = [];

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    this.busquedas.push(id);
    return this.usuariosPorId.get(id) ?? null;
  }
}

export class GeneradorIdsSecuencialFake implements GeneradorIds {
  private contador = 0;

  generar(): string {
    this.contador += 1;
    return `id-${this.contador}`;
  }
}

/**
 * Fake del puerto de ingesta con la misma semántica que los adaptadores
 * reales: unicidad del período mensual y persistencia conjunta de lote
 * + entradas + normas.
 */
export class RepositorioIngestaRegistroOficialFake
  implements RepositorioIngestaRegistroOficial
{
  private readonly lotesPorId = new Map<string, LoteIngestaRegistroOficial>();
  private readonly entradas: EntradaDetectadaRegistroOficialAPersistir[] = [];
  readonly normasGuardadas: Norma[] = [];
  readonly edicionesGuardadas: EdicionRegistroOficial[] = [];

  /**
   * Igual que los adaptadores reales, las ediciones creadas por la ingesta
   * quedan visibles en el repositorio de ediciones compartido.
   */
  constructor(
    private readonly repositorioEdiciones?: RepositorioEdicionesRegistroOficialEnMemoriaFake,
  ) {}

  async buscarLotePorPeriodo(
    periodoAnio: number,
    periodoMes: number,
  ): Promise<LoteIngestaRegistroOficial | null> {
    for (const lote of this.lotesPorId.values()) {
      if (
        lote.periodoAnio === periodoAnio &&
        lote.periodoMes === periodoMes
      ) {
        return lote;
      }
    }
    return null;
  }

  async buscarLotePorId(id: string): Promise<LoteIngestaRegistroOficial | null> {
    return this.lotesPorId.get(id) ?? null;
  }

  async listarLotes(): Promise<LoteIngestaRegistroOficial[]> {
    return [...this.lotesPorId.values()];
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
    const entrada = this.entradas.find(
      (candidata) => candidata.normaId === normaId,
    );
    if (entrada === undefined) {
      return null;
    }
    const lote = this.lotesPorId.get(entrada.loteId);
    if (lote === undefined) {
      return null;
    }
    return {
      urlResumenMensualRegistroOficial: lote.urlResumenMensualRegistroOficial,
      segmentoCrudo: entrada.segmentoCrudo,
    };
  }

  async buscarOrigenesPorNormaIds(
    normaIds: string[],
  ): Promise<ReadonlyMap<string, OrigenRegistroOficialNorma>> {
    const origenes = new Map<string, OrigenRegistroOficialNorma>();
    for (const normaId of normaIds) {
      const origen = await this.buscarOrigenPorNormaId(normaId);
      if (origen !== null) {
        origenes.set(normaId, origen);
      }
    }
    return origenes;
  }

  async guardarIngesta(
    ingesta: IngestaRegistroOficialAPersistir,
  ): Promise<ResultadoGuardarIngesta> {
    if (
      (await this.buscarLotePorPeriodo(
        ingesta.lote.periodoAnio,
        ingesta.lote.periodoMes,
      )) !== null
    ) {
      return { exitoso: false, razon: 'LOTE_YA_REGISTRADO' };
    }
    this.lotesPorId.set(ingesta.lote.id, ingesta.lote);
    this.entradas.push(...ingesta.entradas);
    const reasignadas = new Map<string, string>();
    for (const edicion of ingesta.ediciones) {
      const persistida = this.repositorioEdiciones
        ? await this.repositorioEdiciones.crearORecuperar(edicion)
        : this.crearORecuperarEdicionLocal(edicion);
      if (persistida.esNueva) {
        this.edicionesGuardadas.push(persistida.edicion);
      }
      if (persistida.edicion.id !== edicion.id) {
        reasignadas.set(edicion.id, persistida.edicion.id);
      }
    }
    this.normasGuardadas.push(
      ...ingesta.normas.map((norma) => {
        const idActual = norma.edicionRegistroOficialId;
        const idReasignado =
          idActual === null ? undefined : reasignadas.get(idActual);
        return idReasignado === undefined
          ? norma
          : norma.asociarEdicionRegistroOficial(idReasignado);
      }),
    );
    return { exitoso: true };
  }

  private crearORecuperarEdicionLocal(edicion: EdicionRegistroOficial): {
    edicion: EdicionRegistroOficial;
    esNueva: boolean;
  } {
    const existente = this.edicionesGuardadas.find(
      (candidata) =>
        candidata.tipoPublicacionRegistroOficial ===
          edicion.tipoPublicacionRegistroOficial &&
        candidata.numeroPublicacionRegistroOficial ===
          edicion.numeroPublicacionRegistroOficial &&
        candidata.fechaPublicacionOficial.getTime() ===
          edicion.fechaPublicacionOficial.getTime(),
    );
    return existente === undefined
      ? { edicion, esNueva: true }
      : { edicion: existente, esNueva: false };
  }
}

type ClaveCatalogoFake = {
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
};

/**
 * Catálogo del Registro Oficial configurable por (tipo, número). Devuelve el
 * resultado discriminado del puerto: candidatas en una consulta exitosa o una
 * razón de fallo técnico registrada.
 */
export class CatalogoRegistroOficialFake implements CatalogoRegistroOficial {
  /** Observabilidad de pruebas: cada consulta recibida, en orden. */
  readonly consultas: ConsultaCatalogoRegistroOficial[] = [];
  private readonly candidatasPorClave = new Map<
    string,
    EdicionCatalogoRegistroOficial[]
  >();
  private readonly fallosPorClave = new Map<
    string,
    RazonConsultaCatalogoFallida
  >();

  registrar(
    clave: ClaveCatalogoFake,
    ediciones: EdicionCatalogoRegistroOficial[],
  ): void {
    this.candidatasPorClave.set(claveCatalogo(clave), ediciones);
  }

  /** Registra un fallo técnico del catálogo para una (tipo, número). */
  registrarFallo(
    clave: ClaveCatalogoFake,
    razon: RazonConsultaCatalogoFallida,
  ): void {
    this.fallosPorClave.set(claveCatalogo(clave), razon);
  }

  /** Limpia un fallo previamente registrado (simula que el catálogo se recuperó). */
  limpiarFallo(clave: ClaveCatalogoFake): void {
    this.fallosPorClave.delete(claveCatalogo(clave));
  }

  async buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<ResultadoConsultaCatalogoRegistroOficial> {
    this.consultas.push(consulta);
    const clave = claveCatalogo(consulta);
    const razon = this.fallosPorClave.get(clave);
    if (razon !== undefined) {
      return { exitoso: false, razon };
    }
    return { exitoso: true, candidatas: this.candidatasPorClave.get(clave) ?? [] };
  }
}

/**
 * Fake del puerto de selección por lote. Registra qué `edicionId` (ya
 * deduplicados por triple, como haría un adaptador real) fueron detectados
 * por cada lote, pero SIEMPRE lee el estado actual de cada edición desde el
 * repositorio de ediciones compartido en cada llamada — igual que un
 * adaptador real, nunca una foto fija tomada al registrar — para que
 * `pendientesRestantesLote` y la elegibilidad reflejen correctamente los
 * cambios que la propia resolución fue escribiendo durante el procesamiento
 * de la página.
 */
export class ConsultorEdicionesRegistroOficialPorLoteFake
  implements ConsultorEdicionesRegistroOficialPorLote
{
  private readonly edicionIdsPorLote = new Map<string, string[]>();
  private readonly lotesConocidos = new Set<string>();
  /** Observabilidad de pruebas: cada llamada recibida, en orden. */
  readonly llamadasPagina: Array<{
    loteId: string;
    limite: number;
    cursor: CursorEdicionesLote | null;
  }> = [];
  readonly llamadasConteo: string[] = [];

  constructor(
    private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake,
  ) {}

  /** Un lote real, con las ediciones (posiblemente repetidas) que detectó. */
  registrarLote(loteId: string, edicionIds: string[]): void {
    this.lotesConocidos.add(loteId);
    this.edicionIdsPorLote.set(loteId, edicionIds);
  }

  /** Marca el lote como existente sin ninguna edición asociada aún. */
  registrarLoteVacio(loteId: string): void {
    this.lotesConocidos.add(loteId);
    if (!this.edicionIdsPorLote.has(loteId)) {
      this.edicionIdsPorLote.set(loteId, []);
    }
  }

  /**
   * Agrega una edición más al lote (simula una entrada adicional cuya
   * triple resolvió a esta misma edición); llamar dos veces con el mismo
   * `edicionId` reproduce "varias entradas con la misma triple".
   */
  agregarEdicionAlLote(loteId: string, edicionId: string): void {
    this.lotesConocidos.add(loteId);
    const actuales = this.edicionIdsPorLote.get(loteId) ?? [];
    this.edicionIdsPorLote.set(loteId, [...actuales, edicionId]);
  }

  async listarPaginaPendientes(
    loteId: string,
    limite: number,
    cursor: CursorEdicionesLote | null,
  ): Promise<ResultadoConsultaEdicionesLote> {
    this.llamadasPagina.push({ loteId, limite, cursor });
    if (!this.lotesConocidos.has(loteId)) {
      return { loteEncontrado: false };
    }
    const elegibles = await this.elegiblesOrdenadas(loteId);
    const desdeCursor =
      cursor === null
        ? elegibles
        : elegibles.filter((edicion) => esPosteriorAlCursor(edicion, cursor));
    return {
      loteEncontrado: true,
      ediciones: desdeCursor.slice(0, limite),
      hayMas: desdeCursor.length > limite,
    };
  }

  async contarPendientesDelLote(loteId: string): Promise<number> {
    this.llamadasConteo.push(loteId);
    if (!this.lotesConocidos.has(loteId)) {
      return 0;
    }
    return (await this.elegiblesOrdenadas(loteId)).length;
  }

  private async elegiblesOrdenadas(
    loteId: string,
  ): Promise<EdicionRegistroOficial[]> {
    const ids = [...new Set(this.edicionIdsPorLote.get(loteId) ?? [])];
    const ediciones = await this.repositorioEdiciones.buscarPorIds(ids);
    return ediciones
      .filter(
        (edicion) =>
          edicion.estadoResolucionFuente ===
            EstadoResolucionFuente.PENDIENTE && edicion.urlPdf === null,
      )
      .sort(compararEdicionesPendientesLote);
  }
}

function compararEdicionesPendientesLote(
  a: EdicionRegistroOficial,
  b: EdicionRegistroOficial,
): number {
  const diferenciaFecha =
    a.fechaPublicacionOficial.getTime() - b.fechaPublicacionOficial.getTime();
  return diferenciaFecha !== 0 ? diferenciaFecha : a.id.localeCompare(b.id);
}

function esPosteriorAlCursor(
  edicion: EdicionRegistroOficial,
  cursor: CursorEdicionesLote,
): boolean {
  const fechaEdicion = edicion.fechaPublicacionOficial.getTime();
  const fechaCursor = cursor.fechaPublicacionOficial.getTime();
  if (fechaEdicion !== fechaCursor) {
    return fechaEdicion > fechaCursor;
  }
  return edicion.id > cursor.edicionId;
}

function claveCatalogo(clave: ClaveCatalogoFake): string {
  return `${clave.tipoPublicacionRegistroOficial}||${clave.numeroPublicacionRegistroOficial}`;
}

export function crearUsuarioConRol(rol: RolUsuario, id = `usuario-${rol}`): Usuario {
  return new Usuario({
    id,
    nombre: 'Usuario',
    apellido: 'Prueba',
    correo: `${id}@test.com`,
    rol,
  });
}

export function crearEntradaDetectada(
  parcial: Partial<EntradaDetectadaResumen> = {},
): EntradaDetectadaResumen {
  return {
    posicion: 0,
    tipo: 'Acuerdo Ministerial',
    numero: '123',
    titulo: 'Acuerdo Ministerial 123 de Prueba',
    institucion: 'Ministerio de Prueba',
    seccion: 'Función Ejecutiva',
    publicacion: {
      tipo: 'RO',
      numero: 500,
      fecha: '2026-05-02',
    },
    segmentoCrudo: 'Acuerdo Ministerial 123: disposición de prueba',
    metadataExtraccion: { filaPdf: 4 },
    advertencias: [],
    confianza: 0.95,
    ...parcial,
  };
}

export function crearRegistroDetectado(
  parcial: Partial<EntradaDetectadaResumen> = {},
): EntradaDetectadaResumen {
  return crearEntradaDetectada(parcial);
}

export function crearSolicitudIngesta(
  parcial: Partial<SolicitudIngerirResumenRegistroOficial> = {},
): SolicitudIngerirResumenRegistroOficial {
  return {
    usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    periodo: { anio: 2026, mes: 5 },
    urlResumenMensualRegistroOficial:
      'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
    versionExtractor: '1.0.0',
    entradasDetectadas: [crearEntradaDetectada()],
    ...parcial,
  };
}

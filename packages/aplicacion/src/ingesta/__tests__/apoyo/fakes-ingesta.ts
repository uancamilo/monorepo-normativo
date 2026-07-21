import { EdicionRegistroOficial, Norma, RolUsuario, Usuario } from '@normativo/dominio';
import { RepositorioUsuarios } from '../../../normas/puertos/RepositorioUsuarios';
import { GeneradorIds } from '../../../normas/puertos/GeneradorIds';
import {
  CatalogoRegistroOficial,
  ConsultaCatalogoRegistroOficial,
  EdicionCatalogoRegistroOficial,
} from '../../../normas/puertos/CatalogoRegistroOficial';
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
import { RepositorioEdicionesRegistroOficialEnMemoriaFake } from '../../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';

export class RepositorioUsuariosFake implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
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

/** Catálogo del Registro Oficial configurable por (tipo, número). */
export class CatalogoRegistroOficialFake implements CatalogoRegistroOficial {
  private readonly edicionesPorClave = new Map<
    string,
    EdicionCatalogoRegistroOficial[]
  >();

  registrar(
    consulta: ConsultaCatalogoRegistroOficial,
    ediciones: EdicionCatalogoRegistroOficial[],
  ): void {
    this.edicionesPorClave.set(claveCatalogo(consulta), ediciones);
  }

  async buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<EdicionCatalogoRegistroOficial[]> {
    return this.edicionesPorClave.get(claveCatalogo(consulta)) ?? [];
  }
}

function claveCatalogo(consulta: ConsultaCatalogoRegistroOficial): string {
  return `${consulta.tipoPublicacionRegistroOficial}||${consulta.numeroPublicacionRegistroOficial}`;
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

import {
  ClaveEdicionRegistroOficial,
  EdicionRegistroOficial,
  EdicionRegistroOficialProps,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
  NormaProps,
  RolUsuario,
  Usuario,
} from '@normativo/dominio';
import {
  FiltroListarNormas,
  RepositorioNormas,
  ResultadoActualizarNormaBorrador,
  ResultadoReemplazarEdicionPrincipal,
} from '../../../puertos/RepositorioNormas';
import { ConsultorCambiosEdicionRegistroOficial } from '../../../puertos/ConsultorCambiosEdicionRegistroOficial';
import { RepositorioUsuarios } from '../../../puertos/RepositorioUsuarios';
import {
  RepositorioEdicionesRegistroOficial,
  ResultadoCrearORecuperarEdicionRegistroOficial,
  ResultadoGuardarResolucionFuenteRegistroOficial,
} from '../../../puertos/RepositorioEdicionesRegistroOficial';
import { ConsultorOrigenRegistroOficialNorma } from '../../../puertos/ConsultorOrigenRegistroOficialNorma';
import { OrigenRegistroOficialNorma } from '../../../modelos/VistaEditorialNorma';
import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
} from '../../../puertos/PublicadorEventosNormas';
import {
  ResultadoGuardarPublicacion,
  UnidadDeTrabajoPublicacionNorma,
} from '../../../puertos/UnidadDeTrabajoPublicacionNorma';

export class RepositorioUsuariosEnMemoriaFake implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    return this.usuariosPorId.get(id) ?? null;
  }
}

export class RepositorioNormasEnMemoriaFake
  implements RepositorioNormas, ConsultorCambiosEdicionRegistroOficial
{
  private readonly normasPorId = new Map<string, Norma>();
  private readonly cambiosPorNormaId = new Map<string, Set<string>>();
  readonly guardadas: Norma[] = [];

  agregar(norma: Norma): void {
    this.normasPorId.set(norma.id, norma);
  }

  /** Registra una edición de cambio de una norma (apoyo de pruebas). */
  agregarCambio(normaId: string, edicionRegistroOficialId: string): void {
    const cambios = this.cambiosPorNormaId.get(normaId) ?? new Set<string>();
    cambios.add(edicionRegistroOficialId);
    this.cambiosPorNormaId.set(normaId, cambios);
  }

  async buscarCambiosPorNormaId(normaId: string): Promise<string[]> {
    return [...(this.cambiosPorNormaId.get(normaId) ?? [])];
  }

  async buscarCambiosPorNormaIds(
    normaIds: string[],
  ): Promise<Map<string, string[]>> {
    const resultado = new Map<string, string[]>();
    for (const normaId of normaIds) {
      resultado.set(normaId, [...(this.cambiosPorNormaId.get(normaId) ?? [])]);
    }
    return resultado;
  }

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
    this.guardadas.push(norma);
  }

  async actualizarBorrador(
    norma: Norma,
  ): Promise<ResultadoActualizarNormaBorrador> {
    const actual = this.normasPorId.get(norma.id);
    if (actual === undefined) {
      return { actualizada: false, razon: 'NORMA_NO_ENCONTRADA' };
    }
    if (actual.estaPublicada()) {
      return { actualizada: false, razon: 'NORMA_NO_EDITABLE' };
    }
    // Aplica solo los datos editoriales sobre el estado actual persistido:
    // nunca toca estado editorial, edición asociada ni fecha de publicación.
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
    this.guardadas.push(persistida);
    return { actualizada: true, norma: persistida };
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

    // Idempotente: la nueva ya es la principal, no se altera nada.
    if (principalActual === nuevaEdicionPrincipalId) {
      cambios.delete(nuevaEdicionPrincipalId);
      this.cambiosPorNormaId.set(normaId, cambios);
      return {
        actualizada: true,
        norma: actual,
        edicionesCambioIds: [...cambios],
      };
    }

    // Conserva la principal anterior como cambio y retira la nueva de los
    // cambios si estaba asociada allí (nunca principal y cambio a la vez).
    if (principalActual !== null) {
      cambios.add(principalActual);
    }
    cambios.delete(nuevaEdicionPrincipalId);

    const persistida = actual.asociarEdicionRegistroOficial(
      nuevaEdicionPrincipalId,
    );
    this.normasPorId.set(persistida.id, persistida);
    this.cambiosPorNormaId.set(normaId, cambios);
    this.guardadas.push(persistida);
    return {
      actualizada: true,
      norma: persistida,
      edicionesCambioIds: [...cambios],
    };
  }
}

export class RepositorioEdicionesRegistroOficialEnMemoriaFake
  implements RepositorioEdicionesRegistroOficial
{
  private readonly edicionesPorId = new Map<string, EdicionRegistroOficial>();
  readonly guardadas: EdicionRegistroOficial[] = [];

  agregar(edicion: EdicionRegistroOficial): void {
    this.edicionesPorId.set(edicion.id, edicion);
  }

  async buscarPorId(id: string): Promise<EdicionRegistroOficial | null> {
    return this.edicionesPorId.get(id) ?? null;
  }

  async buscarPorIds(ids: string[]): Promise<EdicionRegistroOficial[]> {
    return ids
      .map((id) => this.edicionesPorId.get(id))
      .filter((edicion): edicion is EdicionRegistroOficial => edicion !== undefined);
  }

  async buscarPorClave(
    clave: ClaveEdicionRegistroOficial,
  ): Promise<EdicionRegistroOficial | null> {
    return this.buscarPorClaveSincrona(clave);
  }

  private buscarPorClaveSincrona(
    clave: ClaveEdicionRegistroOficial,
  ): EdicionRegistroOficial | null {
    for (const edicion of this.edicionesPorId.values()) {
      if (
        edicion.tipoPublicacionRegistroOficial ===
          clave.tipoPublicacionRegistroOficial &&
        edicion.numeroPublicacionRegistroOficial ===
          clave.numeroPublicacionRegistroOficial &&
        edicion.fechaPublicacionOficial.toISOString().slice(0, 10) ===
          clave.fechaPublicacionOficial.toISOString().slice(0, 10)
      ) {
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
    const existente = this.buscarPorClaveSincrona({
      tipoPublicacionRegistroOficial:
        edicion.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial:
        edicion.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: edicion.fechaPublicacionOficial,
    });
    if (existente !== null) {
      return { edicion: existente, esNueva: false };
    }
    this.edicionesPorId.set(edicion.id, edicion);
    this.guardadas.push(edicion);
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
    this.guardadas.push(edicion);
    return { actualizada: true, edicionActual: edicion };
  }

  async guardar(edicion: EdicionRegistroOficial): Promise<void> {
    this.edicionesPorId.set(edicion.id, edicion);
    this.guardadas.push(edicion);
  }
}

export class ConsultorOrigenRegistroOficialFake
  implements ConsultorOrigenRegistroOficialNorma
{
  readonly consultasMasivas: string[][] = [];
  private readonly origenesPorNormaId = new Map<
    string,
    OrigenRegistroOficialNorma
  >();

  registrar(normaId: string, origen: OrigenRegistroOficialNorma): void {
    this.origenesPorNormaId.set(normaId, origen);
  }

  async buscarOrigenPorNormaId(
    normaId: string,
  ): Promise<OrigenRegistroOficialNorma | null> {
    return this.origenesPorNormaId.get(normaId) ?? null;
  }

  async buscarOrigenesPorNormaIds(
    normaIds: string[],
  ): Promise<ReadonlyMap<string, OrigenRegistroOficialNorma>> {
    this.consultasMasivas.push([...normaIds]);
    const origenes = new Map<string, OrigenRegistroOficialNorma>();
    for (const normaId of normaIds) {
      const origen = this.origenesPorNormaId.get(normaId);
      if (origen !== undefined) {
        origenes.set(normaId, origen);
      }
    }
    return origenes;
  }
}

export class PublicadorEventosEnMemoriaFake implements PublicadorEventosNormas {
  readonly eventos: EventoNormaPublicada[] = [];

  async publicarNormaPublicada(evento: EventoNormaPublicada): Promise<void> {
    this.eventos.push(evento);
  }
}

export class UnidadDeTrabajoPublicacionNormaFake
  implements UnidadDeTrabajoPublicacionNorma
{
  constructor(
    private readonly repositorioNormas: RepositorioNormasEnMemoriaFake,
    private readonly publicador: PublicadorEventosEnMemoriaFake,
  ) {}

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<ResultadoGuardarPublicacion> {
    const actual = await this.repositorioNormas.buscarPorId(normaPublicada.id);
    if (actual === null || actual.estaPublicada()) {
      return { publicada: false, razon: 'NORMA_YA_PUBLICADA' };
    }
    // Publica sobre el estado actual persistido: solo cambia estado editorial
    // y fecha, sin pisar correcciones concurrentes con la copia leída.
    const publicada = actual.publicar(evento.fechaPublicacionEnSistema);
    const tieneContenidoCompleto = publicada.tieneContenidoCompleto();
    await this.repositorioNormas.guardar(publicada);
    await this.publicador.publicarNormaPublicada({
      ...evento,
      tieneContenidoCompleto,
    });
    return { publicada: true, tieneContenidoCompleto };
  }
}

export function crearUsuarioEditorial(
  rol: RolUsuario,
  id = `usuario-${rol}`,
): Usuario {
  return new Usuario({
    id,
    nombre: 'Usuario',
    apellido: 'Editorial',
    correo: `${id}@test.com`,
    rol,
  });
}

/**
 * Norma BORRADOR completa y publicable por defecto, asociada a `edicion-1`
 * (crear la edición con `crearEdicionRegistroOficial` cuando el caso de uso
 * necesita validar o proyectar la fuente).
 */
export function crearNormaEditorial(overrides: Partial<NormaProps> = {}): Norma {
  return new Norma({
    id: 'norma-1',
    numero: '123',
    titulo: 'Acuerdo Ministerial 123',
    contenido: [],
    tipoNorma: 'Acuerdo Ministerial',
    institucionExpide: 'Ministerio de Salud Pública',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.BORRADOR,
    fechaExpedicion: null,
    edicionRegistroOficialId: 'edicion-1',
    fechaPublicacionEnSistema: null,
    ...overrides,
  });
}

/** Edición del Registro Oficial publicable por defecto (RESUELTA con urlPdf). */
export function crearEdicionRegistroOficial(
  overrides: Partial<EdicionRegistroOficialProps> = {},
): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id: 'edicion-1',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-02'),
    urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
    ...overrides,
  });
}

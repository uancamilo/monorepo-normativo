import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
  RepositorioEdicionesRegistroOficial,
  RepositorioNormas,
  ResultadoGuardarPublicacion,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { EstadoEditorialNorma, Norma } from '@normativo/dominio';

export class UnidadDeTrabajoPublicacionNormaEnMemoria
  implements UnidadDeTrabajoPublicacionNorma
{
  // Serializa las publicaciones para que la verificación de estado y la
  // escritura sean atómicas entre requests concurrentes, igual que la
  // transacción con actualización condicionada de Prisma.
  private cola: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repositorioNormas: RepositorioNormas,
    private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial,
    private readonly publicadorEventosNormas: PublicadorEventosNormas,
  ) {}

  async guardarNormaPublicadaConEvento(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<ResultadoGuardarPublicacion> {
    const operacion = this.cola.then(() =>
      this.publicarCondicionado(normaPublicada, evento),
    );
    this.cola = operacion.catch(() => undefined);
    return operacion;
  }

  private async publicarCondicionado(
    normaPublicada: Norma,
    evento: EventoNormaPublicada,
  ): Promise<ResultadoGuardarPublicacion> {
    // Misma semántica que Prisma: la transición a PUBLICADA se condiciona al
    // estado actual persistido; la copia leída por el caso de uso no pisa
    // correcciones concurrentes y una doble publicación pierde la carrera.
    const actual = await this.repositorioNormas.buscarPorId(normaPublicada.id);
    if (actual === null || actual.estaPublicada()) {
      return { publicada: false, razon: 'NORMA_YA_PUBLICADA' };
    }

    // Paridad exacta con Prisma: la transición a PUBLICADA solo procede si el
    // estado persistido sigue siendo BORRADOR. Un cambio concurrente a
    // EN_REVISION invalida la publicación obsoleta como conflicto tipado.
    if (actual.estadoEditorial !== EstadoEditorialNorma.BORRADOR) {
      return { publicada: false, razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE' };
    }

    // Barrera de consistencia concurrente: la validación del caso de uso pudo
    // quedar obsoleta si una modificación concurrente vació un obligatorio o
    // reasignó la norma a una edición sin fuente publicable.
    if (actual.camposFaltantesParaPublicar().length > 0) {
      return { publicada: false, razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE' };
    }
    const edicionActual =
      actual.edicionRegistroOficialId === null
        ? null
        : await this.repositorioEdiciones.buscarPorId(
            actual.edicionRegistroOficialId,
          );
    if (
      edicionActual === null ||
      !edicionActual.tieneFuenteValidaParaPublicacion()
    ) {
      return { publicada: false, razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE' };
    }

    const publicada = actual.publicar(evento.fechaPublicacionEnSistema);
    await this.repositorioNormas.guardar(publicada);
    const tieneContenidoCompleto = publicada.tieneContenidoCompleto();
    try {
      // El evento se calcula desde el estado persistido vigente, nunca desde
      // la copia leída por el caso de uso.
      await this.publicadorEventosNormas.publicarNormaPublicada({
        normaId: publicada.id,
        fechaPublicacionEnSistema: evento.fechaPublicacionEnSistema,
        tieneContenidoCompleto,
      });
    } catch (error) {
      // Equivalente en memoria del rollback transaccional: si el evento no
      // puede emitirse, la publicación no queda confirmada.
      await this.repositorioNormas.guardar(actual);
      throw error;
    }
    return { publicada: true, tieneContenidoCompleto };
  }
}

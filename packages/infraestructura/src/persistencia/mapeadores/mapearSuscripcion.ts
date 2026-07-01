import { EstadoSuscripcion, Suscripcion } from '@normativo/dominio';

type SuscripcionPrismaConCorreos = {
  id: string;
  clienteId: string;
  cantidadMaximaUsuarios: number;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  correosHabilitados: Array<{
    correoNormalizado: string;
  }>;
};

export function mapearSuscripcionDesdePrisma(
  suscripcion: SuscripcionPrismaConCorreos,
): Suscripcion {
  return new Suscripcion({
    id: suscripcion.id,
    clienteId: suscripcion.clienteId,
    cantidadMaximaUsuarios: suscripcion.cantidadMaximaUsuarios,
    estado: suscripcion.estado as EstadoSuscripcion,
    fechaInicio: suscripcion.fechaInicio,
    fechaFin: suscripcion.fechaFin,
    correosUsuariosHabilitados: suscripcion.correosHabilitados.map(
      (correo) => correo.correoNormalizado,
    ),
  });
}

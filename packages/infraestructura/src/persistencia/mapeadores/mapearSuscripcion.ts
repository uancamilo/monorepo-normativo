import { EstadoSuscripcion, Suscripcion } from '@normativo/dominio';
import { asegurarValorEnum } from './validarEnum';

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
    estado: asegurarValorEnum(
      suscripcion.estado,
      Object.values(EstadoSuscripcion),
      { entidad: 'Suscripcion', campo: 'estado', id: suscripcion.id },
    ),
    fechaInicio: suscripcion.fechaInicio,
    fechaFin: suscripcion.fechaFin,
    correosUsuariosHabilitados: suscripcion.correosHabilitados.map(
      (correo) => correo.correoNormalizado,
    ),
  });
}

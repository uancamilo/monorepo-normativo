import { EstadoSuscripcion } from '../enums/EstadoSuscripcion';
import { Usuario } from '../../usuarios/entidades/Usuario';
import { estaTextoVacio, normalizarTexto } from '../../compartido/validaciones/texto';

export interface SuscripcionProps {
  id: string;
  usuarioId: string;
  estado: EstadoSuscripcion;
  fechaInicio: Date;
  fechaFin: Date;
}

export class Suscripcion {
  readonly id: string;
  private readonly _usuarioId: string;
  readonly estado: EstadoSuscripcion;
  readonly fechaInicio: Date;
  readonly fechaFin: Date;

  constructor(props: SuscripcionProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la suscripción no puede estar vacío');
    }
    if (estaTextoVacio(props.usuarioId)) {
      throw new Error('El usuarioId de la suscripción no puede estar vacío');
    }

    const esFechaInicioValida = props.fechaInicio instanceof Date && !isNaN(props.fechaInicio.getTime());
    const esFechaFinValida = props.fechaFin instanceof Date && !isNaN(props.fechaFin.getTime());

    if (!esFechaInicioValida) {
      throw new Error('fechaInicio debe ser una fecha válida');
    }
    if (!esFechaFinValida) {
      throw new Error('fechaFin debe ser una fecha válida');
    }
    if (props.fechaFin <= props.fechaInicio) {
      throw new Error('fechaFin debe ser posterior a fechaInicio');
    }

    this.id = normalizarTexto(props.id);
    this._usuarioId = normalizarTexto(props.usuarioId);
    this.estado = props.estado;
    this.fechaInicio = props.fechaInicio;
    this.fechaFin = props.fechaFin;
  }

  perteneceAlUsuario(usuario: Usuario): boolean {
    return usuario.tieneId(this._usuarioId);
  }

  estaActiva(fechaReferencia: Date = new Date()): boolean {
    if (this.estado !== EstadoSuscripcion.ACTIVA) {
      return false;
    }
    return this.fechaFin > fechaReferencia;
  }
}

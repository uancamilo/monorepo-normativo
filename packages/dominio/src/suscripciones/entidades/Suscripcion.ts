import { EstadoSuscripcion } from '../enums/EstadoSuscripcion';
import { Usuario } from '../../usuarios/entidades/Usuario';
import {
  estaTextoVacio,
  normalizarCorreo,
  normalizarTexto,
} from '../../compartido/validaciones/texto';

export interface SuscripcionProps {
  id: string;
  clienteId: string;
  correosUsuariosHabilitados: string[];
  cantidadMaximaUsuarios: number;
  estado: EstadoSuscripcion;
  fechaInicio: Date;
  fechaFin: Date;
}

export class Suscripcion {
  readonly id: string;
  readonly clienteId: string;
  private readonly _correosUsuariosHabilitados: string[];
  readonly cantidadMaximaUsuarios: number;
  readonly estado: EstadoSuscripcion;
  readonly fechaInicio: Date;
  readonly fechaFin: Date;

  constructor(props: SuscripcionProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la suscripción no puede estar vacío');
    }
    if (estaTextoVacio(props.clienteId)) {
      throw new Error('El clienteId de la suscripción no puede estar vacío');
    }
    if (!Number.isInteger(props.cantidadMaximaUsuarios) || props.cantidadMaximaUsuarios <= 0) {
      throw new Error('La cantidad máxima de usuarios debe ser un entero mayor que 0');
    }
    if (props.correosUsuariosHabilitados.length === 0) {
      throw new Error('La suscripción debe habilitar al menos un correo de usuario');
    }
    if (props.correosUsuariosHabilitados.some(estaTextoVacio)) {
      throw new Error('Los correos de usuarios habilitados no pueden estar vacíos');
    }

    const correosNormalizados = props.correosUsuariosHabilitados.map(normalizarCorreo);
    const correosUnicos = new Set(correosNormalizados);

    if (correosUnicos.size !== correosNormalizados.length) {
      throw new Error(
        'La suscripción no puede tener correos de usuarios habilitados duplicados',
      );
    }
    if (correosNormalizados.length > props.cantidadMaximaUsuarios) {
      throw new Error(
        'La cantidad de correos habilitados no puede superar la cantidad máxima de usuarios',
      );
    }

    const esFechaInicioValida =
      props.fechaInicio instanceof Date && !Number.isNaN(props.fechaInicio.getTime());
    const esFechaFinValida =
      props.fechaFin instanceof Date && !Number.isNaN(props.fechaFin.getTime());

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
    this.clienteId = normalizarTexto(props.clienteId);
    this._correosUsuariosHabilitados = correosNormalizados;
    this.cantidadMaximaUsuarios = props.cantidadMaximaUsuarios;
    this.estado = props.estado;
    this.fechaInicio = props.fechaInicio;
    this.fechaFin = props.fechaFin;
  }

  get correosUsuariosHabilitados(): string[] {
    return [...this._correosUsuariosHabilitados];
  }

  habilitaUsuario(usuario: Usuario): boolean {
    return this._correosUsuariosHabilitados.some((correo) => usuario.tieneCorreo(correo));
  }

  estaActiva(fechaReferencia: Date = new Date()): boolean {
    return (
      this.estado === EstadoSuscripcion.ACTIVA &&
      this.fechaInicio <= fechaReferencia &&
      this.fechaFin > fechaReferencia
    );
  }
}

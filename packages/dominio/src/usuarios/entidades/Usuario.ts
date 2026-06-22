import { RolUsuario } from '../enums/RolUsuario';
import {
  estaTextoVacio,
  normalizarCorreo,
  normalizarTexto,
} from '../../compartido/validaciones/texto';

export interface UsuarioProps {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

export class Usuario {
  private readonly _id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: RolUsuario;

  constructor(props: UsuarioProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id del usuario no puede estar vacío');
    }
    if (estaTextoVacio(props.nombre)) {
      throw new Error('El nombre del usuario no puede estar vacío');
    }
    if (estaTextoVacio(props.correo)) {
      throw new Error('El correo del usuario no puede estar vacío');
    }

    this._id = normalizarTexto(props.id);
    this.nombre = normalizarTexto(props.nombre);
    this.correo = normalizarCorreo(props.correo);
    this.rol = props.rol;
  }

  tieneId(id: string): boolean {
    return this._id === id;
  }

  obtenerId(): string {
    return this._id;
  }

  tieneCorreo(correo: string): boolean {
    return this.correo === normalizarCorreo(correo);
  }

  obtenerCorreo(): string {
    return this.correo;
  }

  tieneRol(rol: RolUsuario): boolean {
    return this.rol === rol;
  }
}

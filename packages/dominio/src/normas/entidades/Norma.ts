import { EstadoNorma } from '../enums/EstadoNorma';
import { estaTextoVacio, normalizarTexto } from '../../compartido/validaciones/texto';

export interface NormaProps {
  id: string;
  titulo: string;
  contenido: string;
  estado: EstadoNorma;
  fechaPublicacion: Date | null;
}

export class Norma {
  readonly id: string;
  readonly titulo: string;
  readonly contenido: string;
  readonly estado: EstadoNorma;
  readonly fechaPublicacion: Date | null;

  constructor(props: NormaProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la norma no puede estar vacío');
    }
    if (estaTextoVacio(props.titulo)) {
      throw new Error('El título de la norma no puede estar vacío');
    }
    if (props.estado === EstadoNorma.PUBLICADA && !props.fechaPublicacion) {
      throw new Error('Una norma publicada debe tener fecha de publicación');
    }

    this.id = normalizarTexto(props.id);
    this.titulo = normalizarTexto(props.titulo);
    this.contenido = props.contenido;
    this.estado = props.estado;
    this.fechaPublicacion = props.estado === EstadoNorma.PUBLICADA ? props.fechaPublicacion : null;
  }

  estaPublicada(): boolean {
    return this.estado === EstadoNorma.PUBLICADA;
  }
}

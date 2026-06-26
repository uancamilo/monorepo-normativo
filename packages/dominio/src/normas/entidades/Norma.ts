import { EstadoNorma } from '../enums/EstadoNorma';
import { EstadoEditorialNorma } from '../enums/EstadoEditorialNorma';
import { estaTextoVacio, normalizarTexto } from '../../compartido/validaciones/texto';

type ConstructorUrl = new (url: string) => unknown;

export interface NormaProps {
  id: string;
  numero: string | null;
  titulo: string;
  contenido: string;
  tipoNorma: string;
  institucionExpide: string;
  fuente: string;
  estadoJuridico: EstadoNorma;
  estadoEditorial: EstadoEditorialNorma;
  fechaExpedicion: Date;
  fechaPublicacionOficial: Date;
  fechaPublicacionEnSistema: Date | null;
}

export class Norma {
  readonly id: string;
  readonly numero: string | null;
  readonly titulo: string;
  readonly contenido: string;
  readonly tipoNorma: string;
  readonly institucionExpide: string;
  readonly fuente: string;
  readonly estadoJuridico: EstadoNorma;
  readonly estadoEditorial: EstadoEditorialNorma;
  readonly fechaExpedicion: Date;
  readonly fechaPublicacionOficial: Date;
  readonly fechaPublicacionEnSistema: Date | null;

  constructor(props: NormaProps) {
    if (estaTextoVacio(props.id)) {
      throw new Error('El id de la norma no puede estar vacío');
    }
    if (estaTextoVacio(props.titulo)) {
      throw new Error('El título de la norma no puede estar vacío');
    }
    if (estaTextoVacio(props.tipoNorma)) {
      throw new Error('El tipo de norma no puede estar vacío');
    }
    if (estaTextoVacio(props.institucionExpide)) {
      throw new Error('La institución que expide la norma no puede estar vacía');
    }
    if (estaTextoVacio(props.fuente)) {
      throw new Error('La fuente de la norma no puede estar vacía');
    }

    const fuenteNormalizada = normalizarTexto(props.fuente);

    if (!esUrlValida(fuenteNormalizada)) {
      throw new Error('La fuente de la norma debe ser una URL válida');
    }
    if (!esFechaValida(props.fechaExpedicion)) {
      throw new Error('fechaExpedicion debe ser una fecha válida');
    }
    if (!esFechaValida(props.fechaPublicacionOficial)) {
      throw new Error('fechaPublicacionOficial debe ser una fecha válida');
    }
    if (props.fechaPublicacionOficial < props.fechaExpedicion) {
      throw new Error('fechaPublicacionOficial no puede ser anterior a fechaExpedicion');
    }
    if (
      props.fechaPublicacionEnSistema !== null &&
      !esFechaValida(props.fechaPublicacionEnSistema)
    ) {
      throw new Error('fechaPublicacionEnSistema debe ser una fecha válida');
    }
    if (
      props.estadoEditorial === EstadoEditorialNorma.PUBLICADA &&
      props.fechaPublicacionEnSistema === null
    ) {
      throw new Error(
        'Una norma publicada en sistema debe tener fecha de publicación en sistema',
      );
    }

    this.id = normalizarTexto(props.id);
    this.numero = normalizarNumero(props.numero);
    this.titulo = normalizarTexto(props.titulo);
    this.contenido = props.contenido;
    this.tipoNorma = normalizarTexto(props.tipoNorma);
    this.institucionExpide = normalizarTexto(props.institucionExpide);
    this.fuente = fuenteNormalizada;
    this.estadoJuridico = props.estadoJuridico;
    this.estadoEditorial = props.estadoEditorial;
    this.fechaExpedicion = props.fechaExpedicion;
    this.fechaPublicacionOficial = props.fechaPublicacionOficial;
    this.fechaPublicacionEnSistema =
      props.estadoEditorial === EstadoEditorialNorma.PUBLICADA
        ? props.fechaPublicacionEnSistema
        : null;
  }

  estaVisibleParaSuscriptores(): boolean {
    return this.estadoEditorial === EstadoEditorialNorma.PUBLICADA;
  }

  estaPublicada(): boolean {
    return this.estaVisibleParaSuscriptores();
  }

  publicar(fechaPublicacionEnSistema: Date): Norma {
    return new Norma({
      id: this.id,
      numero: this.numero,
      titulo: this.titulo,
      contenido: this.contenido,
      tipoNorma: this.tipoNorma,
      institucionExpide: this.institucionExpide,
      fuente: this.fuente,
      estadoJuridico: this.estadoJuridico,
      estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      fechaExpedicion: this.fechaExpedicion,
      fechaPublicacionOficial: this.fechaPublicacionOficial,
      fechaPublicacionEnSistema,
    });
  }
}

function normalizarNumero(numero: string | null): string | null {
  if (numero === null || estaTextoVacio(numero)) {
    return null;
  }

  return normalizarTexto(numero);
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function esUrlValida(valor: string): boolean {
  const URLConstructor = (globalThis as unknown as { URL?: ConstructorUrl }).URL;

  if (!URLConstructor) {
    return false;
  }

  try {
    new URLConstructor(valor);
    return true;
  } catch {
    return false;
  }
}

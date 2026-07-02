import {
  EstadoEditorialNorma,
  EstadoNorma,
  Norma,
} from '@normativo/dominio';
import {
  EstadoEditorialNormaPrisma,
  EstadoNormaPrisma,
  Norma as NormaPrisma,
} from '@prisma/client';

export function mapearNormaDesdePrisma(norma: NormaPrisma): Norma {
  return new Norma({
    id: norma.id,
    numero: norma.numero,
    titulo: norma.titulo,
    contenido: norma.contenido,
    tipoNorma: norma.tipoNorma,
    institucionExpide: norma.institucionExpide,
    fuente: norma.fuente,
    estadoJuridico: norma.estadoJuridico as EstadoNorma,
    estadoEditorial: norma.estadoEditorial as EstadoEditorialNorma,
    fechaExpedicion: norma.fechaExpedicion,
    fechaPublicacionOficial: norma.fechaPublicacionOficial,
    fechaPublicacionEnSistema: norma.fechaPublicacionEnSistema,
  });
}

export function mapearNormaADataPrisma(norma: Norma) {
  return {
    id: norma.id,
    numero: norma.numero,
    titulo: norma.titulo,
    contenido: norma.contenido,
    tipoNorma: norma.tipoNorma,
    institucionExpide: norma.institucionExpide,
    fuente: norma.fuente,
    estadoJuridico: norma.estadoJuridico as EstadoNormaPrisma,
    estadoEditorial: norma.estadoEditorial as EstadoEditorialNormaPrisma,
    fechaExpedicion: norma.fechaExpedicion,
    fechaPublicacionOficial: norma.fechaPublicacionOficial,
    fechaPublicacionEnSistema: norma.fechaPublicacionEnSistema,
  };
}

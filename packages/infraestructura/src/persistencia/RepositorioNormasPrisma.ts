import { Injectable } from '@nestjs/common';
import {
  EstadoEditorialNormaPrisma,
  EstadoNormaPrisma,
} from '@prisma/client';
import { Norma } from '@normativo/dominio';
import { RepositorioNormas } from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { mapearNormaDesdePrisma } from './mapeadores/mapearNorma';

@Injectable()
export class RepositorioNormasPrisma implements RepositorioNormas {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Norma | null> {
    const norma = await this.prisma.norma.findUnique({
      where: { id },
    });

    return norma === null ? null : mapearNormaDesdePrisma(norma);
  }

  async guardar(norma: Norma): Promise<void> {
    await this.prisma.norma.upsert({
      where: { id: norma.id },
      create: datosPersistencia(norma),
      update: datosPersistencia(norma),
    });
  }
}

function datosPersistencia(norma: Norma) {
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

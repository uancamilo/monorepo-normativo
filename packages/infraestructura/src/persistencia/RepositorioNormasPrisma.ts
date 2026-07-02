import { Injectable } from '@nestjs/common';
import { Norma } from '@normativo/dominio';
import { RepositorioNormas } from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapearNormaADataPrisma,
  mapearNormaDesdePrisma,
} from './mapeadores/mapearNorma';

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
      create: mapearNormaADataPrisma(norma),
      update: mapearNormaADataPrisma(norma),
    });
  }
}

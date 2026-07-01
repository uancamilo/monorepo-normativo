import { Injectable } from '@nestjs/common';
import { Usuario } from '@normativo/dominio';
import { RepositorioUsuarios } from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { mapearUsuarioDesdePrisma } from './mapeadores/mapearUsuario';

@Injectable()
export class RepositorioUsuariosPrisma implements RepositorioUsuarios {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
    });

    return usuario === null ? null : mapearUsuarioDesdePrisma(usuario);
  }
}

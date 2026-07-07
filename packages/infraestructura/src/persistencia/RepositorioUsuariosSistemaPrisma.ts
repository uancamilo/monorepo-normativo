import { Injectable } from '@nestjs/common';
import {
  RepositorioUsuariosSistema,
  UsuarioSistemaNuevo,
} from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { RolUsuarioPrisma } from '@prisma/client';

@Injectable()
export class RepositorioUsuariosSistemaPrisma
  implements RepositorioUsuariosSistema
{
  constructor(private readonly prisma: PrismaService) {}

  async existeCorreo(correoNormalizado: string): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correoNormalizado },
      select: { id: true },
    });
    return usuario !== null;
  }

  async crear(usuario: UsuarioSistemaNuevo): Promise<void> {
    // Solo la tabla usuarios; el UNIQUE de correo_normalizado es la garantía
    // fuerte ante carreras (el caso de uso ya pre-verificó existeCorreo).
    await this.prisma.usuario.create({
      data: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correoNormalizado: usuario.correoNormalizado,
        rol: usuario.rol as RolUsuarioPrisma,
        passwordHash: usuario.passwordHash,
      },
    });
  }
}

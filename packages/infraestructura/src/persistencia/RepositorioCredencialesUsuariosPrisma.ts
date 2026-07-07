import { Injectable } from '@nestjs/common';
import { RolUsuario } from '@normativo/dominio';
import {
  CredencialesUsuario,
  RepositorioCredencialesUsuarios,
} from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { asegurarValorEnum } from './mapeadores/validarEnum';

@Injectable()
export class RepositorioCredencialesUsuariosPrisma
  implements RepositorioCredencialesUsuarios
{
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorCorreo(
    correoNormalizado: string,
  ): Promise<CredencialesUsuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correoNormalizado },
      select: { id: true, rol: true, passwordHash: true },
    });

    return usuario === null ? null : mapearCredenciales(usuario);
  }

  async buscarPorUsuarioId(
    usuarioId: string,
  ): Promise<CredencialesUsuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, rol: true, passwordHash: true },
    });

    return usuario === null ? null : mapearCredenciales(usuario);
  }

  async actualizarPasswordHash(
    usuarioId: string,
    passwordHash: string,
  ): Promise<void> {
    // Solo el campo passwordHash del usuario objetivo; nada más.
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash },
    });
  }
}

function mapearCredenciales(usuario: {
  id: string;
  rol: string;
  passwordHash: string | null;
}): CredencialesUsuario {
  return {
    usuarioId: usuario.id,
    rol: asegurarValorEnum(usuario.rol, Object.values(RolUsuario), {
      entidad: 'Usuario',
      campo: 'rol',
      id: usuario.id,
    }),
    hashContrasena: usuario.passwordHash,
  };
}

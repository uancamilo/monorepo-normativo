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

    if (usuario === null) {
      return null;
    }

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
}

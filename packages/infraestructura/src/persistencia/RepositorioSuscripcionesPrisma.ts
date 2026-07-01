import { Injectable } from '@nestjs/common';
import { Suscripcion } from '@normativo/dominio';
import { RepositorioSuscripciones } from '@normativo/aplicacion';
import { PrismaService } from '../prisma/prisma.service';
import { mapearSuscripcionDesdePrisma } from './mapeadores/mapearSuscripcion';

@Injectable()
export class RepositorioSuscripcionesPrisma
  implements RepositorioSuscripciones
{
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorCorreoHabilitado(correo: string): Promise<Suscripcion | null> {
    const correoNormalizado = normalizarCorreo(correo);

    const correoHabilitado =
      await this.prisma.suscripcionCorreoHabilitado.findUnique({
        where: { correoNormalizado },
        include: {
          suscripcion: {
            include: {
              correosHabilitados: true,
            },
          },
        },
      });

    if (correoHabilitado === null) {
      return null;
    }

    return mapearSuscripcionDesdePrisma(correoHabilitado.suscripcion);
  }
}

function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

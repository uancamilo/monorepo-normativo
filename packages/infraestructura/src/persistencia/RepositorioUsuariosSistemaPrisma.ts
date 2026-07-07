import { Injectable } from '@nestjs/common';
import {
  RepositorioUsuariosSistema,
  ResultadoCrearUsuarioSistemaRepositorio,
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

  async crear(
    usuario: UsuarioSistemaNuevo,
  ): Promise<ResultadoCrearUsuarioSistemaRepositorio> {
    try {
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
      return { exitoso: true };
    } catch (error) {
      // Solo el P2002 del UNIQUE de correo se traduce a duplicado; cualquier
      // otro error (incluido P2002 de otra columna) se propaga sin ocultar.
      if (esViolacionUnicaDeCorreo(error)) {
        return { exitoso: false, razon: 'CORREO_YA_REGISTRADO' };
      }
      throw error;
    }
  }
}

/**
 * Detección estructural del P2002 de Prisma sobre el UNIQUE del correo.
 * Se evita `instanceof` (con driver adapters la clase puede no coincidir entre
 * módulos). Los campos del constraint llegan en `meta.target` (runtime
 * clásico) o en `meta.driverAdapterError.cause.constraint.fields` (Prisma 7
 * con driver adapters, verificado con @prisma/adapter-pg).
 */
function esViolacionUnicaDeCorreo(error: unknown): boolean {
  const posible = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown } };
      };
    };
  } | null;

  if (posible === null || posible.code !== 'P2002') {
    return false;
  }

  const objetivo =
    posible.meta?.target ??
    posible.meta?.driverAdapterError?.cause?.constraint?.fields;
  const columnas = Array.isArray(objetivo)
    ? objetivo.map(String)
    : [String(objetivo ?? '')];

  return columnas.some(
    (columna) =>
      columna.includes('correo_normalizado') ||
      columna.includes('correoNormalizado'),
  );
}

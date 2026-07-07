import { Module } from '@nestjs/common';
import {
  CrearUsuarioSistema,
  GeneradorHashContrasenas,
  GeneradorIds,
  RepositorioUsuarios,
  RepositorioUsuariosSistema,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { NormasPrismaModule } from '../normas/normas-prisma.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsuariosController } from './usuarios.controller';
import { RepositorioUsuariosSistemaPrisma } from '../persistencia/RepositorioUsuariosSistemaPrisma';
import { ServicioHashContrasenas } from '../autenticacion/hash-contrasenas';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
import { TOKEN_REPOSITORIO_USUARIOS_SISTEMA } from './tokens';

/**
 * Gestión mínima de usuarios internos sobre Prisma/PostgreSQL (Fase 4G).
 * usuarios.correo_normalizado UNIQUE es la garantía fuerte de unicidad.
 */
@Module({
  imports: [AutenticacionModule, PrismaModule, NormasPrismaModule],
  controllers: [UsuariosController],
  providers: [
    {
      provide: TOKEN_REPOSITORIO_USUARIOS_SISTEMA,
      useClass: RepositorioUsuariosSistemaPrisma,
    },
    { provide: ServicioHashContrasenas, useClass: ServicioHashContrasenas },
    {
      provide: CrearUsuarioSistema,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioUsuariosSistema: RepositorioUsuariosSistema,
        generadorIds: GeneradorIds,
        generadorHashContrasenas: GeneradorHashContrasenas,
      ) =>
        new CrearUsuarioSistema({
          repositorioUsuarios,
          repositorioUsuariosSistema,
          generadorIds,
          generadorHashContrasenas,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_USUARIOS_SISTEMA,
        TOKEN_GENERADOR_IDS,
        ServicioHashContrasenas,
      ],
    },
  ],
})
export class UsuariosPrismaModule {}

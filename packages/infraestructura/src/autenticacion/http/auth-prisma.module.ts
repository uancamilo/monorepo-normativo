import { Module } from '@nestjs/common';
import {
  IniciarSesion,
  RepositorioCredencialesUsuarios,
  VerificadorContrasenas,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion.module';
import { ServicioHashContrasenas } from '../hash-contrasenas';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositorioCredencialesUsuariosPrisma } from '../../persistencia/RepositorioCredencialesUsuariosPrisma';
import {
  TOKEN_REPOSITORIO_CREDENCIALES,
  TOKEN_VERIFICADOR_CONTRASENAS,
} from '../tokens';

/**
 * Login con credenciales persistidas en PostgreSQL (usuarios.password_hash).
 */
@Module({
  imports: [AutenticacionModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: TOKEN_VERIFICADOR_CONTRASENAS, useClass: ServicioHashContrasenas },
    {
      provide: TOKEN_REPOSITORIO_CREDENCIALES,
      useClass: RepositorioCredencialesUsuariosPrisma,
    },
    {
      provide: IniciarSesion,
      useFactory: (
        repositorioCredenciales: RepositorioCredencialesUsuarios,
        verificadorContrasenas: VerificadorContrasenas,
      ) =>
        new IniciarSesion({ repositorioCredenciales, verificadorContrasenas }),
      inject: [TOKEN_REPOSITORIO_CREDENCIALES, TOKEN_VERIFICADOR_CONTRASENAS],
    },
  ],
})
export class AuthPrismaModule {}

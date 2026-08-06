import { Module } from '@nestjs/common';
import {
  CambiarContrasenaPropia,
  ConsultarPerfilPropio,
  IniciarSesion,
  RepositorioCredencialesUsuarios,
  RepositorioUsuarios,
  VerificadorContrasenas,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion.module';
import { ServicioHashContrasenas } from '../hash-contrasenas';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositorioCredencialesUsuariosPrisma } from '../../persistencia/RepositorioCredencialesUsuariosPrisma';
import { NormasPrismaModule } from '../../normas/normas-prisma.module';
import { TOKEN_REPOSITORIO_USUARIOS } from '../../normas/tokens';
import {
  TOKEN_REPOSITORIO_CREDENCIALES,
  TOKEN_VERIFICADOR_CONTRASENAS,
} from '../tokens';

/**
 * Login con credenciales persistidas en PostgreSQL (usuarios.password_hash).
 *
 * Importa NormasPrismaModule para reutilizar EXACTAMENTE la misma instancia de
 * RepositorioUsuariosPrisma (TOKEN_REPOSITORIO_USUARIOS) que usan los casos de
 * uso editoriales, en vez de construir un segundo adaptador.
 */
@Module({
  imports: [AutenticacionModule, PrismaModule, NormasPrismaModule],
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
    {
      provide: CambiarContrasenaPropia,
      useFactory: (
        repositorioCredenciales: RepositorioCredencialesUsuarios,
        servicioHashContrasenas: ServicioHashContrasenas,
      ) =>
        new CambiarContrasenaPropia({
          repositorioCredenciales,
          verificadorContrasenas: servicioHashContrasenas,
          generadorHashContrasenas: servicioHashContrasenas,
        }),
      inject: [TOKEN_REPOSITORIO_CREDENCIALES, TOKEN_VERIFICADOR_CONTRASENAS],
    },
    {
      provide: ConsultarPerfilPropio,
      useFactory: (repositorioUsuarios: RepositorioUsuarios) =>
        new ConsultarPerfilPropio({ repositorioUsuarios }),
      inject: [TOKEN_REPOSITORIO_USUARIOS],
    },
  ],
})
export class AuthPrismaModule {}

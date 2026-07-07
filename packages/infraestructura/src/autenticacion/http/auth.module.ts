import { Module } from '@nestjs/common';
import {
  CambiarContrasenaPropia,
  IniciarSesion,
  RepositorioCredencialesUsuarios,
  VerificadorContrasenas,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion.module';
import { ServicioHashContrasenas } from '../hash-contrasenas';
import { AuthController } from './auth.controller';
import { RepositorioCredencialesUsuariosEnMemoria } from '../../memoria/RepositorioCredencialesUsuariosEnMemoria';
import {
  TOKEN_REPOSITORIO_CREDENCIALES,
  TOKEN_VERIFICADOR_CONTRASENAS,
} from '../tokens';

/**
 * Login con credenciales en memoria (usuarios semilla locales).
 */
@Module({
  imports: [AutenticacionModule],
  controllers: [AuthController],
  providers: [
    { provide: TOKEN_VERIFICADOR_CONTRASENAS, useClass: ServicioHashContrasenas },
    {
      provide: TOKEN_REPOSITORIO_CREDENCIALES,
      useFactory: (hashContrasenas: ServicioHashContrasenas) =>
        new RepositorioCredencialesUsuariosEnMemoria(hashContrasenas),
      inject: [TOKEN_VERIFICADOR_CONTRASENAS],
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
  ],
  // Compartido con la gestión mínima de usuarios (Fase 4G): misma instancia de
  // credenciales en memoria para que el usuario creado pueda iniciar sesión.
  exports: [TOKEN_REPOSITORIO_CREDENCIALES],
})
export class AuthModule {}

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
import { RepositorioCredencialesUsuariosEnMemoria } from '../../memoria/RepositorioCredencialesUsuariosEnMemoria';
import { NormasModule } from '../../normas/normas.module';
import { TOKEN_REPOSITORIO_USUARIOS } from '../../normas/tokens';
import {
  TOKEN_REPOSITORIO_CREDENCIALES,
  TOKEN_VERIFICADOR_CONTRASENAS,
} from '../tokens';

/**
 * Login con credenciales en memoria (usuarios semilla locales).
 *
 * Importa NormasModule para reutilizar EXACTAMENTE la misma instancia de
 * RepositorioUsuarios en memoria (TOKEN_REPOSITORIO_USUARIOS) que usan los
 * casos de uso editoriales: `GET /auth/me` debe ver los mismos usuarios.
 * No hay ciclo: NormasModule importa AutenticacionModule (guard/tokens), no
 * AuthModule.
 */
@Module({
  imports: [AutenticacionModule, NormasModule],
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
    {
      provide: ConsultarPerfilPropio,
      useFactory: (repositorioUsuarios: RepositorioUsuarios) =>
        new ConsultarPerfilPropio({ repositorioUsuarios }),
      inject: [TOKEN_REPOSITORIO_USUARIOS],
    },
  ],
  // Compartido con la gestión mínima de usuarios (Fase 4G): misma instancia de
  // credenciales en memoria para que el usuario creado pueda iniciar sesión.
  exports: [TOKEN_REPOSITORIO_CREDENCIALES],
})
export class AuthModule {}

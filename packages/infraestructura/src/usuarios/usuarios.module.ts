import { Module } from '@nestjs/common';
import {
  CrearUsuarioSistema,
  GeneradorHashContrasenas,
  GeneradorIds,
  RepositorioUsuarios,
  RepositorioUsuariosSistema,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { NormasModule } from '../normas/normas.module';
import { UsuariosController } from './usuarios.controller';
import { RepositorioUsuariosSistemaEnMemoria } from '../memoria/RepositorioUsuariosSistemaEnMemoria';
import { RepositorioUsuariosEnMemoria } from '../memoria/RepositorioUsuariosEnMemoria';
import { RepositorioCredencialesUsuariosEnMemoria } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';
import { ServicioHashContrasenas } from '../autenticacion/hash-contrasenas';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
import { TOKEN_REPOSITORIO_CREDENCIALES } from '../autenticacion/tokens';
import { TOKEN_REPOSITORIO_USUARIOS_SISTEMA } from './tokens';

/**
 * Gestión mínima de usuarios internos en memoria (Fase 4G). Reutiliza las
 * mismas instancias de NormasModule (usuarios) y AuthModule (credenciales)
 * para que el usuario creado pueda operar y hacer login.
 */
@Module({
  imports: [AutenticacionModule, NormasModule, AuthModule],
  controllers: [UsuariosController],
  providers: [
    {
      provide: TOKEN_REPOSITORIO_USUARIOS_SISTEMA,
      useFactory: (
        repositorioUsuarios: RepositorioUsuariosEnMemoria,
        repositorioCredenciales: RepositorioCredencialesUsuariosEnMemoria,
      ) =>
        new RepositorioUsuariosSistemaEnMemoria(
          repositorioUsuarios,
          repositorioCredenciales,
        ),
      inject: [TOKEN_REPOSITORIO_USUARIOS, TOKEN_REPOSITORIO_CREDENCIALES],
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
export class UsuariosModule {}

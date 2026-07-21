import { Module } from '@nestjs/common';
import {
  ConsultarLoteIngestaRegistroOficial,
  ConsultarLotesIngestaRegistroOficial,
  GeneradorIds,
  IngerirResumenRegistroOficial,
  RepositorioEdicionesRegistroOficial,
  RepositorioIngestaRegistroOficial,
  RepositorioUsuarios,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NormasPrismaModule } from '../normas/normas-prisma.module';
import { IngestaRegistroOficialController } from './ingesta.controller';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
import { TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL } from './tokens';
import { obtenerConfiguracionIngesta } from '../configuracion/ingesta';

/** Ingesta del Registro Oficial respaldada por Prisma/PostgreSQL (Fase 5A). */
@Module({
  imports: [AutenticacionModule, PrismaModule, NormasPrismaModule],
  controllers: [IngestaRegistroOficialController],
  providers: [
    {
      provide: IngerirResumenRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        generadorIds: GeneradorIds,
      ) =>
        new IngerirResumenRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
          repositorioEdiciones,
          generadorIds,
          limiteMaximoEntradas:
            obtenerConfiguracionIngesta().limiteMaximoEntradas,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_GENERADOR_IDS,
      ],
    },
    {
      provide: ConsultarLotesIngestaRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new ConsultarLotesIngestaRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConsultarLoteIngestaRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new ConsultarLoteIngestaRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
  ],
})
export class IngestaPrismaModule {}

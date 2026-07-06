import { Module } from '@nestjs/common';
import { obtenerConfiguracionJwt } from '../configuracion/jwt';
import { ServicioTokens } from './servicio-tokens';
import { GuardAutenticacion } from './guard-autenticacion';

@Module({
  providers: [
    {
      provide: ServicioTokens,
      useFactory: () => {
        const jwt = obtenerConfiguracionJwt();
        return new ServicioTokens({
          secreto: jwt.secreto,
          emisor: jwt.emisor,
          audiencia: jwt.audiencia,
        });
      },
    },
    GuardAutenticacion,
  ],
  exports: [ServicioTokens, GuardAutenticacion],
})
export class AutenticacionModule {}

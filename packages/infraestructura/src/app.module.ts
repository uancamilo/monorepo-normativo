import { Module } from '@nestjs/common';
import { seleccionarModulosHttp } from './normas/seleccionar-modulo-normas';

@Module({
  imports: [...seleccionarModulosHttp()],
})
export class AppModule {}

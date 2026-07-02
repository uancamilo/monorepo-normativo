import { Module } from '@nestjs/common';
import { seleccionarModuloNormas } from './normas/seleccionar-modulo-normas';

@Module({
  imports: [seleccionarModuloNormas()],
})
export class AppModule {}

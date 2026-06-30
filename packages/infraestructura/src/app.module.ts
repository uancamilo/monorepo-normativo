import { Module } from '@nestjs/common';
import { NormasModule } from './normas/normas.module';

@Module({
  imports: [NormasModule],
})
export class AppModule {}

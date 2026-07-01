import { Module } from '@nestjs/common';
import { NormasModule } from './normas/normas.module';
import { NormasPrismaModule } from './normas/normas-prisma.module';

const moduloNormas =
  process.env.PERSISTENCIA === 'prisma' ? NormasPrismaModule : NormasModule;

@Module({
  imports: [moduloNormas],
})
export class AppModule {}

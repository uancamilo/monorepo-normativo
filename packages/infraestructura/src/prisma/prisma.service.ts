import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(crearOpcionesPrisma());
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function crearOpcionesPrisma(): Prisma.PrismaClientOptions {
  // Solo DATABASE_URL: el runtime nunca debe redirigirse a la base de test por
  // una TEST_DATABASE_URL filtrada al entorno. Los tests asignan DATABASE_URL.
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error(
      'DATABASE_URL debe estar configurada para usar persistencia Prisma',
    );
  }

  return {
    adapter: new PrismaPg(databaseUrl),
  };
}

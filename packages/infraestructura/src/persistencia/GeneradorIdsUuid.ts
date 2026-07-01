import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GeneradorIds } from '@normativo/aplicacion';

@Injectable()
export class GeneradorIdsUuid implements GeneradorIds {
  generar(): string {
    return randomUUID();
  }
}

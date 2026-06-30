import { Injectable } from '@nestjs/common';
import { GeneradorIds } from '@normativo/aplicacion';

/**
 * Genera ids determinísticos norma-1, norma-2, norma-3, ...
 * Adaptador en memoria para Fase 3A. No es persistente.
 */
@Injectable()
export class GeneradorIdsSecuencial implements GeneradorIds {
  private contador = 0;

  generar(): string {
    this.contador += 1;
    return `norma-${this.contador}`;
  }
}

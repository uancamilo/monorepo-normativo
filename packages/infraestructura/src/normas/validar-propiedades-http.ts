import { BadRequestException } from '@nestjs/common';

/**
 * Validación HTTP local para DTOs parciales. Evita que propiedades ajenas al
 * contrato sean descartadas silenciosamente y que se aplique una mutación
 * parcial sobre un payload inválido.
 */
export function asegurarSoloPropiedadesPermitidas(
  valor: unknown,
  propiedadesPermitidas: readonly string[],
): asserts valor is Record<string, unknown> {
  if (
    typeof valor !== 'object' ||
    valor === null ||
    Array.isArray(valor) ||
    Object.keys(valor).some(
      (propiedad) => !propiedadesPermitidas.includes(propiedad),
    )
  ) {
    throw new BadRequestException('SOLICITUD_INVALIDA');
  }
}

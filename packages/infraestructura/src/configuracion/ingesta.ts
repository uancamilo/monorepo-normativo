import { LIMITE_PREDETERMINADO_ENTRADAS_INGESTA } from '@normativo/aplicacion';

export const LIMITE_CUERPO_JSON_POR_DEFECTO = '8mb';

export interface ConfiguracionIngesta {
  limiteMaximoEntradas: number;
  limiteCuerpoJson: string;
}

/**
 * Configuración operativa de la ingesta. No forma parte de las reglas del
 * dominio: infraestructura la valida y la inyecta al caso de uso puro.
 */
export function obtenerConfiguracionIngesta(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionIngesta {
  return {
    limiteMaximoEntradas: validarLimiteEntradas(
      entorno.INGESTA_MAX_ENTRADAS,
    ),
    limiteCuerpoJson: validarLimiteCuerpoJson(
      entorno.HTTP_JSON_BODY_LIMIT,
    ),
  };
}

function validarLimiteEntradas(valor: string | undefined): number {
  if (valor === undefined || valor.trim().length === 0) {
    return LIMITE_PREDETERMINADO_ENTRADAS_INGESTA;
  }

  const limite = Number(valor);
  if (!Number.isInteger(limite) || limite <= 0) {
    throw new Error('INGESTA_MAX_ENTRADAS debe ser un entero positivo');
  }
  return limite;
}

function validarLimiteCuerpoJson(valor: string | undefined): string {
  if (valor === undefined || valor.trim().length === 0) {
    return LIMITE_CUERPO_JSON_POR_DEFECTO;
  }

  const normalizado = valor.trim().toLowerCase();
  if (!/^\d+(kb|mb)$/.test(normalizado)) {
    throw new Error(
      'HTTP_JSON_BODY_LIMIT debe usar un valor positivo en kb o mb',
    );
  }
  if (Number.parseInt(normalizado, 10) <= 0) {
    throw new Error(
      'HTTP_JSON_BODY_LIMIT debe usar un valor positivo en kb o mb',
    );
  }
  return normalizado;
}

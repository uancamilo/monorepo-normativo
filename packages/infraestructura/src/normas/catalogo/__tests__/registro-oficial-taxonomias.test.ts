import { describe, expect, it } from '@jest/globals';
import {
  ID_CARPETA_POR_ABREVIATURA,
  MES_ID_POR_MES,
  ubicarCarpetaRegistroOficial,
  YEAR_ID_POR_ANIO,
} from '../registro-oficial-taxonomias';

describe('ubicarCarpetaRegistroOficial', () => {
  it('resuelve un año cubierto por la taxonomía base sin necesitar aniosExtra', () => {
    const ubicacion = ubicarCarpetaRegistroOficial('RO', 2026, 5);

    expect(ubicacion).toEqual({
      idCarpeta: 1954,
      yearId: 2002,
      mesId: 1983,
      nombreMes: 'Mayo',
    });
  });

  it('devuelve null para un año no cubierto sin aniosExtra (incertidumbre, no ausencia)', () => {
    expect(ubicarCarpetaRegistroOficial('RO', 2027, 1)).toBeNull();
  });

  it('resuelve un año no cubierto por la base usando aniosExtra', () => {
    const ubicacion = ubicarCarpetaRegistroOficial('RO', 2027, 1, {
      2027: 2004,
    });

    expect(ubicacion).toEqual({
      idCarpeta: 1954,
      yearId: 2004,
      mesId: 1979,
      nombreMes: 'Enero',
    });
  });

  it('la taxonomía base verificada siempre gana sobre aniosExtra para el mismo año', () => {
    // Una variable de entorno mal puesta no debe poder pisar un año ya
    // verificado en el código: si aniosExtra redefine 2026, se ignora.
    const ubicacion = ubicarCarpetaRegistroOficial('RO', 2026, 5, {
      2026: 9999,
    });

    expect(ubicacion?.yearId).toBe(YEAR_ID_POR_ANIO[2026]);
  });
});

describe('cobertura de la taxonomía de años (alarma operativa)', () => {
  it('cubre siempre el año en curso', () => {
    const anioActual = new Date().getUTCFullYear();
    const anioMaximoCubierto = Math.max(
      ...Object.keys(YEAR_ID_POR_ANIO).map(Number),
    );

    expect(anioMaximoCubierto).toBeGreaterThanOrEqual(anioActual);
  });

  it('desde noviembre exige que YEAR_ID_POR_ANIO cubra también el año siguiente (ANIOS_EXTRA no satisface esta alarma)', () => {
    // Esta prueba inspecciona EXCLUSIVAMENTE YEAR_ID_POR_ANIO, la taxonomía
    // versionada y verificada en código. CATALOGO_REGISTRO_OFICIAL_ANIOS_EXTRA
    // (ver configuracion/catalogo-registro-oficial.ts) es solo un parche
    // operativo de runtime para mantener el servicio funcionando ante una
    // urgencia: nunca modifica YEAR_ID_POR_ANIO y por lo tanto nunca puede
    // hacer pasar esta prueba. La alarma se considera resuelta únicamente
    // cuando el año y su id oficial verificado se consolidan en
    // YEAR_ID_POR_ANIO; si _ANIOS_EXTRA se activó para cubrir una urgencia,
    // la deuda de consolidación sigue abierta hasta ese momento. Antes de
    // noviembre solo exigimos el año en curso: el sitio oficial recién crea
    // la carpeta del año siguiente cerca de su propio inicio, así que una
    // alarma activa todo el año generaría ruido sin darle tiempo útil a
    // nadie.
    const ahora = new Date();
    const anioActual = ahora.getUTCFullYear();
    const mesActual = ahora.getUTCMonth() + 1;
    const anioMaximoCubierto = Math.max(
      ...Object.keys(YEAR_ID_POR_ANIO).map(Number),
    );

    if (mesActual < 11) {
      expect(anioMaximoCubierto).toBeGreaterThanOrEqual(anioActual);
      return;
    }
    expect(anioMaximoCubierto).toBeGreaterThanOrEqual(anioActual + 1);
  });
});

describe('cobertura de tipos y meses (sin expiración; solo consistencia estructural)', () => {
  it('cada tipo de publicación documentado en el ADR tiene su id de carpeta', () => {
    expect(ID_CARPETA_POR_ABREVIATURA.RO).toBe(1954);
    expect(ID_CARPETA_POR_ABREVIATURA.SRO).toBe(1991);
    expect(ID_CARPETA_POR_ABREVIATURA.EE).toBe(1992);
    expect(ID_CARPETA_POR_ABREVIATURA.EJ).toBe(1994);
    expect(ID_CARPETA_POR_ABREVIATURA.EC).toBe(1995);
  });

  it('cubre los 12 meses', () => {
    expect(Object.keys(MES_ID_POR_MES)).toHaveLength(12);
  });
});

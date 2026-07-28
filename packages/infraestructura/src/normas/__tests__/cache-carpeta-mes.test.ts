import { describe, expect, it } from '@jest/globals';
import { CacheCarpetaMes } from '../catalogo/cache-carpeta-mes';

const OK = { exitoso: true as const, cards: [], cardsNoConfiables: [] };
const FALLO = {
  exitoso: false as const,
  razon: 'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE' as const,
};

describe('CacheCarpetaMes', () => {
  it('deduplica descargas concurrentes de la misma clave (una sola descarga)', async () => {
    let descargas = 0;
    const cache = new CacheCarpetaMes(60_000, 16);
    const descargar = async () => {
      descargas += 1;
      await Promise.resolve();
      return OK;
    };

    await Promise.all([
      cache.obtener('k', descargar),
      cache.obtener('k', descargar),
      cache.obtener('k', descargar),
    ]);

    expect(descargas).toBe(1);
  });

  it('no cachea fallos: una consulta posterior reintenta', async () => {
    let descargas = 0;
    const cache = new CacheCarpetaMes(60_000, 16);

    await cache.obtener('k', async () => {
      descargas += 1;
      return FALLO;
    });
    await cache.obtener('k', async () => {
      descargas += 1;
      return OK;
    });

    expect(descargas).toBe(2);
  });

  it('expira una descarga exitosa pasado el TTL', async () => {
    let t = 0;
    let descargas = 0;
    const cache = new CacheCarpetaMes(1000, 16, () => t);
    const descargar = async () => {
      descargas += 1;
      return OK;
    };

    await cache.obtener('k', descargar);
    t = 1500;
    await cache.obtener('k', descargar);

    expect(descargas).toBe(2);
  });

  it('no crece de forma ilimitada: acota el número de entradas', async () => {
    const cache = new CacheCarpetaMes(60_000, 4);

    for (let i = 0; i < 50; i += 1) {
      await cache.obtener(`k-${i}`, async () => OK);
    }

    expect(cache.tamano).toBeLessThanOrEqual(4);
  });
});

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * A5: ninguna suite individual debe decidir si compila (eso permitió que
 * `cli.test.ts` y `extractor-integral.test.ts` dispararan dos builds
 * completos concurrentes desde sus propios `beforeAll`, ~150s). El build
 * debe estar orquestado una sola vez, fuera de los workers de Jest y en
 * cada comando público que puede ejecutar estas suites desde un árbol
 * limpio. Los comandos internos `*:compilado` permiten que `npm test`
 * comparta ese único build sin anidarlo.
 */

const RAIZ_REPOSITORIO = resolve(__dirname, '../../../../../..');

function leerJson(ruta: string): Record<string, unknown> {
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

describe('A5 — build orquestado fuera de los workers de Jest', () => {
  it('npm test orquesta explícitamente un único build y usa la variante compilada de infraestructura', () => {
    const pkg = leerJson(resolve(RAIZ_REPOSITORIO, 'package.json'));
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.pretest).toBeUndefined();
    expect(scripts.test).toMatch(/^npm run build &&/);
    expect(scripts.test).toContain('npm run test:infraestructura:compilado');
  });

  it.each(['test:infraestructura', 'test:extractor'])(
    '%s compila una sola vez y delega en una variante que no vuelve a compilar',
    (nombreScript) => {
      const pkg = leerJson(resolve(RAIZ_REPOSITORIO, 'package.json'));
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts[nombreScript]).toMatch(
        new RegExp(
          `^npm run build && npm run ${nombreScript.replace(
            'test:extractor',
            'test:extractor:compilado',
          ).replace(
            'test:infraestructura',
            'test:infraestructura:compilado',
          )}$`,
        ),
      );
    },
  );

  it('las variantes compiladas ejecutan Jest sin iniciar otro build', () => {
    const pkg = leerJson(resolve(RAIZ_REPOSITORIO, 'package.json'));
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts['test:infraestructura:compilado']).toBe(
      'npm run test --workspace=@normativo/infraestructura',
    );
    expect(scripts['test:extractor:compilado']).toContain(
      'ingesta/extractor-registro-oficial',
    );
    expect(scripts['test:infraestructura:compilado']).not.toContain(
      'npm run build',
    );
    expect(scripts['test:extractor:compilado']).not.toContain('npm run build');
  });

  it('infraestructura no define su propio pretest (evita builds implícitos dentro del workspace)', () => {
    const pkg = leerJson(
      resolve(RAIZ_REPOSITORIO, 'packages/infraestructura/package.json'),
    );
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    expect(scripts.pretest).toBeUndefined();
  });

  it.each(['cli.test.ts', 'extractor-integral.test.ts'])(
    '%s no dispara un build por sí mismo (falla rápido y claro si falta dist)',
    (archivo) => {
      const contenido = readFileSync(resolve(__dirname, archivo), 'utf-8');
      expect(contenido).not.toMatch(/['"]run['"],\s*['"]build['"]/);
      expect(contenido).not.toContain('npm run build');
      expect(contenido.toLowerCase()).toContain('no existe el cli compilado');
    },
  );
});

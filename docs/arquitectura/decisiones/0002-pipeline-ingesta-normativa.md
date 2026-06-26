# ADR 0002: Pipeline de ingesta normativa desde resumen mensual

## Estado

Aceptada como decisión de diseño. No implementada todavía.

## Contexto

- El sistema puede poblar la base de datos desde PDFs de resumen mensual del Registro Oficial.
- El resumen mensual contiene títulos, metadata y referencias a la fuente oficial específica de cada norma.
- El resumen mensual no contiene el texto completo de cada norma.
- La fuente oficial específica puede ser Registro Oficial, suplemento, edición especial u otra publicación oficial.
- Un mismo resumen mensual puede originar varias normas y un mismo PDF fuente oficial puede contener varias normas; por tanto `fuente` no es única.
- El contenido completo se obtendrá posteriormente desde la fuente oficial específica.

## Decisión

- Usar scraping del resumen mensual para crear registros de normas en estado editorial `BORRADOR`.
- Detectar y asignar desde ese scraping la fuente oficial específica de cada norma. La `fuente` de la norma es esa fuente oficial específica detectada.
- Permitir que una norma pase a `PUBLICADA` con metadata aprobada aunque todavía no tenga contenido completo.
- Mostrar el PDF fuente oficial incrustado cuando una norma publicada no tenga contenido completo. El sistema no inventa ni simula contenido completo.
- Sincronizar automáticamente con Algolia cuando una norma pasa a `PUBLICADA`.
- Restringir el scraping inicialmente a `SUPERADMINISTRADOR`, con posibilidad de que el `SUPERADMINISTRADOR` habilite globalmente a un `EDITOR`.

## Consecuencias

- Se puede poblar la base de datos progresivamente desde el resumen mensual.
- La búsqueda pública puede funcionar sobre metadata publicada, porque las normas también se buscan por metadata.
- El detalle de una norma publicada sin contenido completo muestra la metadata y el PDF fuente oficial incrustado.
- El contenido completo se enriquecerá en una fase posterior desde la fuente oficial específica.
- El scraping queda fuera del dominio y será infraestructura o adaptador en una fase futura.

## Referencias

- `docs/reglas-negocio.md`, sección 13: pipeline de ingesta normativa (Fase 1).
- `docs/arquitectura/vision-arquitectura.md`, subsección "Pipeline de ingesta normativa (Fase 1)".
- ADR-0001: arquitectura hexagonal y reglas de dependencia entre `dominio`, `aplicacion` e infraestructura futura.

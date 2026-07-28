'use strict';

/**
 * Fixture HTTP local del catálogo oficial del Registro Oficial para la
 * corrida Newman de Fase 5B. Infraestructura de pruebas con responsabilidad
 * única: emular el contrato WordPress `admin-ajax` mínimo que consume
 * `CatalogoRegistroOficialHttp`, sin dependencias nuevas (solo `node:http`).
 *
 * Nunca se consulta el sitio oficial: este servidor escucha solo en
 * 127.0.0.1 y responde con datos fabricados de test. Comportamiento (el mismo
 * del fixture E2E Prisma):
 * - POST /wp-admin/admin-ajax.php con action=get_term_post_kilur_con_imagen:
 *   - mayo 2026 (year_id=2002, mes_id=1983): una card válida "RO 700" con PDF
 *     en https://cdn.oficial.test/... (allowlist de la corrida local);
 *   - cualquier otro mes: página de mantenimiento sin cards (el adaptador la
 *     clasifica RESPUESTA_CATALOGO_INVALIDA y la edición sigue PENDIENTE).
 * - Cualquier otra ruta/método/acción: 404.
 *
 * No es un servidor persistente: se inicia explícitamente para la corrida y
 * se detiene con SIGINT/SIGTERM. Puerto: FIXTURE_CATALOGO_PUERTO (default 3999).
 */

const { createServer } = require('node:http');

const PUERTO = Number(process.env.FIXTURE_CATALOGO_PUERTO ?? 3999);
const HOST = '127.0.0.1';
const RUTA_ADMIN_AJAX = '/wp-admin/admin-ajax.php';
const ACCION_LISTADO = 'get_term_post_kilur_con_imagen';
// Términos WordPress reales de mayo 2026 (ver registro-oficial-taxonomias.ts).
const YEAR_ID_2026 = '2002';
const MES_ID_MAYO = '1983';

const CARDS_MAYO_2026 = `<section>
  <article>
    <h2 class="card__title_post_imagen">Registro Oficial Nº 700</h2>
    <div class="txt_fecha_post_imagen">lunes, 4 mayo 2026\nQuito</div>
    <a class="cta_post_imagen" href="https://cdn.oficial.test/ediciones/ro-700.pdf">Descargar</a>
  </article>
</section>`;

const PAGINA_MANTENIMIENTO =
  '<html><body>Servicio temporalmente en mantenimiento</body></html>';

const servidor = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== RUTA_ADMIN_AJAX) {
      res.statusCode = 404;
      res.end('No encontrado');
      return;
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    if (form.get('action') !== ACCION_LISTADO) {
      res.statusCode = 404;
      res.end('Acción no soportada');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const esMayo2026 =
      form.get('year_id') === YEAR_ID_2026 && form.get('mes_id') === MES_ID_MAYO;
    res.end(esMayo2026 ? CARDS_MAYO_2026 : PAGINA_MANTENIMIENTO);
  });
});

function detener(senal) {
  console.log(`Fixture catálogo: recibida ${senal}, deteniendo...`);
  servidor.close(() => process.exit(0));
}

process.on('SIGINT', () => detener('SIGINT'));
process.on('SIGTERM', () => detener('SIGTERM'));

servidor.listen(PUERTO, HOST, () => {
  console.log(
    `Fixture catálogo Registro Oficial escuchando en http://${HOST}:${PUERTO} (solo test; Ctrl+C para detener)`,
  );
});

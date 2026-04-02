/**
 * Comprueba en PostgreSQL cuáles id_dropi de la lista "64 faltantes en export"
 * existen en la tabla pedidos y cuáles no.
 *
 * Uso (desde la raíz del back): node scripts/check-feb64-pedidos-db.cjs
 * Variables: DB_HOST / DATABASE_HOST, DB_PORT / DATABASE_PORT, etc. (ver abajo)
 */
require('dotenv').config();
const { Client } = require('pg');

/** Los 64 ID que no aparecían en la hoja Pedidos del Excel vs Hoja1 (feb 2026). */
const REFERENCE_IDS = [
  '64588133', '64588501', '64588687', '64589097', '64589481', '64589684',
  '64590244', '64590489', '64591097', '64591212', '64591287', '64592877',
  '64592987', '64593077', '64593333', '64612497', '64613138', '64613534',
  '64613610', '64613887', '64614117', '64615578', '64616276', '64616475',
  '64616546', '64616937', '64617206', '64617217', '64617362', '64617504',
  '64617881', '64617963', '64618076', '64618143', '64618299', '64618410',
  '64618715', '64618732', '64619325', '64619388', '64619773', '64619825',
  '64619939', '64619963', '64620166', '64620393', '64620605', '64620692',
  '64620815', '64620941', '64621006', '64621034', '64621055', '64621259',
  '64621322', '64621469', '64621516', '64621902', '64622235', '64622411',
  '64622473', '64622820', '64623344', '64632024',
];

function env(name, alt, fallback) {
  return process.env[name] || (alt ? process.env[alt] : '') || fallback;
}

async function main() {
  const client = new Client({
    host: env('DB_HOST', 'DATABASE_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', 'DATABASE_PORT', '5432'), 10),
    user: env('DB_USERNAME', 'DATABASE_USER', 'postgres'),
    password: env('DB_PASSWORD', 'DATABASE_PASSWORD', 'postgres'),
    database: env('DB_DATABASE', 'DATABASE_NAME', 'pethoV8'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  const res = await client.query(
    `SELECT id_dropi, fecha::text AS fecha FROM pedidos WHERE id_dropi = ANY($1::varchar[])`,
    [REFERENCE_IDS],
  );

  const byId = new Map(res.rows.map((r) => [String(r.id_dropi).trim(), r.fecha]));

  const existen = [];
  const noExisten = [];

  for (const id of REFERENCE_IDS) {
    if (byId.has(id)) existen.push({ id, fecha: byId.get(id) });
    else noExisten.push(id);
  }

  console.log('=== Referencia: 64 id_dropi (Excel Hoja1 sin fila en export Pedidos) ===\n');
  console.log(`Existen en tabla pedidos: ${existen.length}`);
  existen.sort((a, b) => a.id.localeCompare(b.id)).forEach((r) => {
    console.log(`  ${r.id}\tfecha BD: ${r.fecha ?? '(null)'}`);
  });

  console.log(`\nNo existen en tabla pedidos: ${noExisten.length}`);
  noExisten.forEach((id) => console.log(`  ${id}`));

  await client.end();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

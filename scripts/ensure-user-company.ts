/**
 * Asigna la empresa por defecto a un usuario por username (insensible a mayúsculas).
 * Uso: npx ts-node --transpile-only -r dotenv/config scripts/ensure-user-company.ts [username]
 * Ejemplo: npm run ensure-user-company -- Fercho
 */
import 'dotenv/config';
import pg from 'pg';

async function main() {
  const username = (process.argv[2] || 'Fercho').trim();
  if (!username) {
    console.error('Indica un username.');
    process.exit(1);
  }

  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const { rows: empRows } = await client.query<{ id: number }>(
      `SELECT id FROM empresas
       WHERE is_active = true
         AND slug IN ('jyd-tiendas-online', 'empresa-principal')
       ORDER BY CASE WHEN slug = 'jyd-tiendas-online' THEN 0 ELSE 1 END
       LIMIT 1`,
    );
    let empresaId = empRows[0]?.id;
    if (empresaId == null) {
      const { rows: anyEmp } = await client.query<{ id: number }>(
        `SELECT id FROM empresas WHERE is_active = true ORDER BY id ASC LIMIT 1`,
      );
      empresaId = anyEmp[0]?.id;
    }
    if (empresaId == null) {
      console.error('No hay empresas en la BD. Ejecuta migraciones primero.');
      process.exit(1);
    }

    const { rows: userRows } = await client.query<{
      id: number;
      username: string;
      email: string;
      is_active: boolean;
    }>(
      `SELECT id, username, email, is_active FROM users
       WHERE LOWER(username) = LOWER($1) AND is_deleted = false
       LIMIT 1`,
      [username],
    );

    const user = userRows[0];
    if (!user) {
      const { rows: hint } = await client.query<{ username: string }>(
        `SELECT username FROM users WHERE is_deleted = false ORDER BY username LIMIT 20`,
      );
      console.error(`No existe usuario no eliminado con username similar a "${username}".`);
      console.error('Algunos usernames en BD:', hint.map((r) => r.username).join(', '));
      process.exit(1);
    }

    await client.query(
      `INSERT INTO user_empresas (user_id, empresa_id, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, empresa_id)
       DO UPDATE SET is_active = true`,
      [user.id, empresaId],
    );

    console.log(
      `OK: usuario id=${user.id} (${user.username} / ${user.email}) → empresa_id=${empresaId}, is_active en users=${user.is_active}`,
    );
    if (!user.is_active) {
      console.warn('La cuenta está INACTIVA en users; el login seguirá fallando hasta activarla.');
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

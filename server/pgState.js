import pg from "pg";

const { Pool } = pg;
let pool;
let chain = Promise.resolve();

function sslOption(url) {
  if (/localhost|127\.0\.0\.1/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

async function saveSnapshot(snapshot) {
  await pool.query(
    `INSERT INTO elfin_state (id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    ["main", JSON.stringify(snapshot)],
  );
}

export async function hydrateFromPostgres(fallback) {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 2, ssl: sslOption(url) });
  await pool.query(`CREATE TABLE IF NOT EXISTS elfin_state (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const result = await pool.query("SELECT payload FROM elfin_state WHERE id = $1", ["main"]);
  if (!result.rows[0]?.payload?.state || !result.rows[0]?.payload?.sheet) {
    await saveSnapshot(fallback);
    return fallback;
  }
  return result.rows[0].payload;
}

export function queueSnapshot(snapshot) {
  if (!pool) return;
  const copy = JSON.parse(JSON.stringify(snapshot));
  chain = chain.then(() => saveSnapshot(copy)).catch(() => {
    console.error("Postgres persist failed");
  });
}

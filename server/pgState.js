import crypto from "crypto";
import pg from "pg";
import { mergeSnapshots } from "./stateShape.js";

const { Pool } = pg;
let pool;
let latest = Promise.resolve();

function sslOption(url) {
  if (/localhost|127\.0\.0\.1/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

function stop(field) {
  const error = new Error("STATE_MIGRATION_STOPPED");
  error.code = "STATE_MIGRATION_STOPPED";
  error.field = field;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function interpretPayload(payload, fallback) {
  if (isRecord(payload?.state) && isRecord(payload?.sheet)) return payload;
  if (isRecord(payload) && ["users", "orders", "reservations", "items", "orderIdempotency", "paymentIdempotency", "notices", "stockMoves"].some((key) => key in payload)) {
    const sheet = isRecord(fallback?.sheet) ? fallback.sheet : { products: [], couriers: [], orders: [], liquidPrices: {} };
    return { state: payload, sheet };
  }
  if (isRecord(payload) && Object.keys(payload).length === 0) return fallback;
  stop("payload");
}

async function saveSnapshot(snapshot) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT payload FROM elfin_state WHERE id = $1 FOR UPDATE", ["main"]);
    let body = snapshot;
    if (locked.rows[0]?.payload) body = mergeSnapshots(locked.rows[0].payload, snapshot);
    const saved = await client.query(
      `INSERT INTO elfin_state (id, payload, revision, updated_at)
       VALUES ($1, $2::jsonb, 1, now())
       ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload,
             revision = elfin_state.revision + 1,
             updated_at = now()
       RETURNING revision`,
      ["main", JSON.stringify(body)],
    );
    await client.query("COMMIT");
    return { body, revision: Number(saved.rows[0].revision) };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Postgres rollback failed:", rollbackError?.code || rollbackError?.message || "error");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function backupPayload(payload) {
  if (!pool) return;
  const id = `backup-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  await pool.query(
    `INSERT INTO elfin_state (id, payload, revision, updated_at) VALUES ($1, $2::jsonb, 0, now())`,
    [id, JSON.stringify(payload)],
  );
  console.log(`State backup: ${id}`);
  return id;
}

export async function hydrateFromPostgres(fallback) {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return null;
  if (!pool) pool = new Pool({ connectionString: url, max: 4, ssl: sslOption(url) });
  await pool.query(`CREATE TABLE IF NOT EXISTS elfin_state (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL DEFAULT 0
  )`);
  await pool.query("ALTER TABLE elfin_state ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0");
  const result = await pool.query("SELECT payload, revision FROM elfin_state WHERE id = $1", ["main"]);
  if (!result.rows[0]) {
    await saveSnapshot(fallback);
    return { payload: fallback, original: null, backup: backupPayload };
  }
  const original = JSON.parse(JSON.stringify(result.rows[0].payload));
  const working = JSON.parse(JSON.stringify(original));
  let payload;
  try {
    payload = interpretPayload(working, fallback);
  } catch (error) {
    console.error(`State migration stopped: ${error.field || "payload"}`);
    throw error;
  }
  return { payload, original, backup: backupPayload };
}

export function queueSnapshot(snapshot, adopt) {
  if (!pool) return Promise.resolve(snapshot);
  const copy = JSON.parse(JSON.stringify(snapshot));
  const run = latest.catch(() => undefined).then(() => saveSnapshot(copy));
  const settled = run.then((saved) => {
    if (typeof adopt === "function" && saved?.body) adopt(saved.body);
    return saved?.body;
  });
  latest = settled;
  settled.catch((error) => {
    console.error("Postgres persist failed:", error?.code || error?.message || "error");
  });
  return settled;
}

export function whenPersisted() {
  return latest;
}

export async function allocateDisplayNumbers(count, minimum = 1000) {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url || !pool) return null;
  const wanted = Math.max(0, Number(count) || 0);
  const floor = Math.max(1000, Number(minimum) || 1000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS elfin_display_counter (
      id text PRIMARY KEY,
      value bigint NOT NULL
    )`);
    await client.query("INSERT INTO elfin_display_counter (id, value) VALUES ('order', 1000) ON CONFLICT (id) DO NOTHING");
    const locked = await client.query("SELECT value FROM elfin_display_counter WHERE id = 'order' FOR UPDATE");
    const base = Math.max(Number(locked.rows[0].value) || 1000, floor);
    const numbers = [];
    for (let step = 1; step <= wanted; step += 1) numbers.push(base + step);
    await client.query("UPDATE elfin_display_counter SET value = $1 WHERE id = 'order'", [base + wanted]);
    await client.query("COMMIT");
    return numbers;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Display number rollback failed:", rollbackError?.code || rollbackError?.message || "error");
    }
    throw error;
  } finally {
    client.release();
  }
}

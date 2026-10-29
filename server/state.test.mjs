import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import pg from "pg";
import { signInitData } from "../tests/telegram-sign.mjs";
import {
  describeState,
  expireReservationRecords,
  mergeSnapshots,
  normalizeSnapshot,
  STATE_SCHEMA,
} from "./stateShape.js";

const database = "elfin_market_state_test";
const dbUser = os.userInfo().username;
const databaseUrl = `postgres://${dbUser}@127.0.0.1:5432/${database}`;

if (process.env.STATE_WRITER === "1") {
  const { hydrateStore, db, persist } = await import("./store.js");
  await hydrateStore();
  fs.writeFileSync(process.env.READY_FILE, "ready");
  const started = Date.now();
  while (!fs.existsSync(process.env.GO_FILE)) {
    if (Date.now() - started > 8000) process.exit(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const id = process.env.ORDER_ID;
  db().orders[id] = {
    id,
    user_id: "123456789",
    city: "HH",
    status: "buffer",
    created_at: new Date().toISOString(),
    stock_committed: false,
  };
  await persist();
  process.exit(0);
}

const checks = [];

function record(id, ok, detail) {
  checks.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail || ""}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function blankSheet() {
  return { products: [], couriers: [], orders: [], liquidPrices: {} };
}

function fullState(extra = {}) {
  return {
    schemaVersion: STATE_SCHEMA,
    users: { "7": { tg_id: "7", first_name: "N", status: "user" } },
    orders: {},
    items: [],
    reservations: [],
    promos: [],
    orderIdempotency: {},
    paymentIdempotency: {},
    notices: [],
    stockMoves: [],
    tickets: [],
    ...extra,
  };
}

function wrap(state, sheet = blankSheet()) {
  return { state, sheet };
}

function product() {
  return { sku: "north:10", name: "Северный", category: "Мята", price: 9.9, stock: 8, active: true, brand: "ELFIN" };
}

function courier() {
  return {
    courier_id: "courier-north",
    name: "Север",
    tg_id: "100000001",
    active: true,
    time_from: "12:00",
    time_to: "18:00",
    meeting_place: "Северный вход",
    phone: "",
  };
}

try {
  const empty = { users: {} };
  const emptySheet = blankSheet();
  const emptyReport = normalizeSnapshot(empty, emptySheet);
  assert(emptyReport.filled.includes("orders"), "empty orders filled");
  assert(emptyReport.filled.includes("reservations"), "empty reservations filled");
  assert(emptyReport.filled.includes("orderIdempotency"), "empty idempotency filled");
  assert(!Array.isArray(empty.orders) && empty.orders && typeof empty.orders === "object", "orders object");
  assert(Array.isArray(empty.reservations) && empty.reservations.length === 0, "reservations array");
  record("A", true, "empty state normalized");
} catch (error) {
  record("A", false, error.message);
}

try {
  const legacy = {
    users: { "424242": { tg_id: "424242", first_name: "Legacy", status: "user" } },
    orders: { "ORD-KEEP": { id: "ORD-KEEP", user_id: "424242", status: "pending", city: "HH" } },
  };
  const report = normalizeSnapshot(legacy, blankSheet());
  assert(report.filled.includes("reservations"), "reservations filled");
  assert(!report.filled.includes("orders"), "existing orders were not replaced");
  assert(legacy.orders["ORD-KEEP"].status === "pending", "legacy order kept");
  assert(legacy.users["424242"].first_name === "Legacy", "legacy user kept");
  assert(Array.isArray(legacy.reservations), "reservations array");
  record("B", true, "legacy state without reservations");
} catch (error) {
  record("B", false, error.message);
}

try {
  const broken = {
    users: { "424242": { tg_id: "424242", first_name: "Legacy", status: "user" } },
    orders: { "ORD-KEEP": { id: "ORD-KEEP", status: "pending" } },
    reservations: 5,
  };
  let field = "";
  try {
    normalizeSnapshot(broken, blankSheet());
  } catch (error) {
    field = error.field;
  }
  assert(field === "reservations", "wrong reservation type stops");
  assert(broken.reservations === 5, "wrong type was not replaced");
  assert(broken.orders["ORD-KEEP"].status === "pending", "orders untouched");
  record("C", true, "wrong reservation type refused");
} catch (error) {
  record("C", false, error.message);
}

try {
  const legacy = {
    schemaVersion: 1,
    users: { "7": { tg_id: "7", status: "user" } },
    orders: { "ORD-1": { id: "ORD-1", status: "buffer" } },
    items: [],
    reservations: [],
    promos: [],
    notices: [],
    stockMoves: [],
    tickets: [],
  };
  const report = normalizeSnapshot(legacy, blankSheet());
  assert(report.filled.includes("orderIdempotency") && report.filled.includes("paymentIdempotency"), "idempotency filled");
  assert(legacy.orders["ORD-1"].status === "buffer", "order kept");
  assert(legacy.orderIdempotency && typeof legacy.orderIdempotency === "object" && !Array.isArray(legacy.orderIdempotency), "idempotency map");
  record("D", true, "missing idempotency map");
} catch (error) {
  record("D", false, error.message);
}

try {
  const valid = fullState({
    orders: { "ORD-1": { id: "ORD-1", status: "pending", city: "HH" } },
    reservations: [{ order_id: "ORD-1", product_id: "north:10", qty: 1, released: false, expiry_ms: 10 }],
  });
  const sheet = { products: [product()], couriers: [courier()], orders: [], liquidPrices: {} };
  const first = normalizeSnapshot(valid, sheet);
  const second = normalizeSnapshot(valid, sheet);
  assert(first.changed === false && second.changed === false, "valid state is unchanged");
  assert(valid.orders["ORD-1"].status === "pending", "valid order kept");
  assert(!describeState(valid, sheet).includes("Legacy") && !describeState(valid, sheet).includes("north:10"), "diagnostic has no values");
  record("E", true, "valid state stays");
} catch (error) {
  record("E", false, error.message);
}

try {
  const remote = wrap(fullState({
    orders: { A: { id: "A", status: "pending", city: "HH" } },
    reservations: [{ order_id: "A", product_id: "north:10", qty: 1, released: false, expiry_ms: 5 }],
  }), { products: [{ ...product(), stock: 8 }], couriers: [], orders: [], liquidPrices: {} });
  const local = wrap(fullState({
    orders: { B: { id: "B", status: "buffer", city: "HH" } },
    reservations: [{ order_id: "A", product_id: "north:10", qty: 1, released: true, expiry_ms: 5 }],
  }), { products: [{ ...product(), stock: 7 }], couriers: [], orders: [], liquidPrices: {} });
  const merged = mergeSnapshots(remote, local);
  assert(merged.state.orders.A.status === "pending" && merged.state.orders.B.status === "buffer", "both orders kept");
  assert(merged.state.reservations.length === 1 && merged.state.reservations[0].released === true, "released reservation stays released");
  assert(merged.sheet.products[0].stock === 7, "stale higher stock does not overwrite the sale");
  const delivered = mergeSnapshots(
    wrap(fullState({ orders: { A: { id: "A", status: "pending" } } })),
    wrap(fullState({ orders: { A: { id: "A", status: "delivered", delivered_at: "2026-01-02T00:00:00.000Z" } } })),
  );
  assert(delivered.state.orders.A.status === "delivered", "delivered is not replaced by pending");
  record("G-merge", true, "concurrent snapshots keep both orders");
} catch (error) {
  record("G-merge", false, error.message);
}

try {
  const reservations = [{ order_id: "ORD-1", product_id: "north:10", qty: 1, released: false, expiry_ms: 1 }];
  const orders = { "ORD-1": { id: "ORD-1", status: "buffer", stock_committed: false } };
  const first = expireReservationRecords(reservations, orders, 10);
  const second = expireReservationRecords(reservations, orders, 20);
  assert(first.length === 1 && second.length === 0, "cleanup runs once");
  assert(reservations[0].released === true && orders["ORD-1"].status === "cancelled", "reserve released once");
  const held = [{ order_id: "ORD-2", product_id: "north:10", qty: 1, released: false, expiry_ms: 50 }];
  const activeOrders = { "ORD-2": { id: "ORD-2", status: "buffer", stock_committed: false } };
  assert(expireReservationRecords(held, activeOrders, 10).length === 0 && held[0].released === false, "active reserve stays");
  assert(expireReservationRecords([], {}, 10).length === 0, "empty cleanup");
  const released = [{ order_id: "ORD-3", product_id: "north:10", qty: 1, released: true, expiry_ms: 1 }];
  const closed = { "ORD-3": { id: "ORD-3", status: "pending", stock_committed: false } };
  assert(expireReservationRecords(released, closed, 10).length === 0 && closed["ORD-3"].status === "pending", "released reserve is not cancelled again");
  record("H", true, "cleanup twice");
} catch (error) {
  record("H", false, error.message);
}

function ensureDatabase() {
  const probe = spawnSync("psql", ["-h", "127.0.0.1", "-d", "postgres", "-Atc", `SELECT 1 FROM pg_database WHERE datname = '${database}'`], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error("local postgres is not available");
  if (probe.stdout.trim() !== "1") {
    const created = spawnSync("createdb", ["-h", "127.0.0.1", database], { encoding: "utf8" });
    if (created.status !== 0) throw new Error("test database was not created");
  }
}

async function resetDatabase(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS elfin_state (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL DEFAULT 0
  )`);
  await client.query("DELETE FROM elfin_state");
}

function legacyPayload() {
  return {
    state: {
      users: { "424242": { tg_id: "424242", username: "legacy", first_name: "Legacy", status: "user", bonus_balance: 0 } },
      orders: [{ id: "ORD-LEGACY", user_id: "424242", city: "HH", status: "pending", created_at: "2026-01-01T00:00:00.000Z", stock_committed: true }],
    },
    sheet: { products: [product()], couriers: [courier()], orders: [], liquidPrices: {} },
  };
}

function startApi(dir, port) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATA_DIR: dir,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "state-test-secret",
      TELEGRAM_BOT_TOKEN: "elfin-state-test-bot",
      TELEGRAM_BOT_USERNAME: "elfin_state_bot",
      CITY_CODE: "HH",
      DEMO_CATALOG: "1",
      ALLOW_DEV_AUTH: "0",
      ENABLE_LIVE_WRITES: "false",
      SHEETS_READ_ONLY: "true",
      TELEGRAM_TEST_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  child.readLog = () => log;
  return child;
}

async function waitReady(port, child) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (child.exitCode != null) throw new Error("API exited during boot");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ready`);
      if (response.ok) return await response.json();
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("API did not become ready");
}

async function stopServer(child) {
  if (!child || child.exitCode != null) return child?.exitCode;
  child.kill("SIGTERM");
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(() => {
      child.kill("SIGKILL");
      resolve("sigkill");
    }, 4000)),
  ]);
}

async function call(port, urlPath, { method = "GET", token, body, headers } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function login(port, user) {
  const initData = signInitData(user, Math.floor(Date.now() / 1000), "elfin-state-test-bot");
  return call(port, "/api/auth/telegram", { method: "POST", body: { initData } });
}

async function mainShape(client) {
  const result = await client.query("SELECT payload, revision FROM elfin_state WHERE id = 'main'");
  return result.rows[0];
}

async function runIntegration() {
  ensureDatabase();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const port = 8796;
  const dir = mkdtempSync(path.join(tmpdir(), "elfin-state-"));
  let child;
  try {
    await resetDatabase(client);
    await client.query("INSERT INTO elfin_state (id, payload, revision) VALUES ('main', $1::jsonb, 1)", [JSON.stringify(legacyPayload())]);
    child = startApi(dir, port);
    const ready = await waitReady(port, child);
    const log = child.readLog();
    assert(ready.database === "persistent" && ready.stateSchema === 1, "ready schema");
    assert(ready.reservations === "array" && ready.orders === "object" && ready.orderIdempotency === "object", "ready field types");
    assert(ready.reservationCleanup === "ok", "cleanup did not throw");
    assert(!log.includes("not iterable") && !log.includes("Cannot read properties of undefined"), "boot has no order TypeError");
    assert(!log.includes("Reservation cleanup error"), "cleanup error is absent");
    assert(log.includes("State migration:") && log.includes("Reservation cleanup: ok"), "migration and cleanup logged");
    assert(log.indexOf("State schema before:") < log.indexOf("Reservation cleanup: ok"), "cleanup starts after load");
    assert(ready.users === "object", "users kept as object");
    const saved = await mainShape(client);
    assert(Array.isArray(saved.payload.state.reservations), "stored reservations array");
    assert(saved.payload.state.orders["ORD-LEGACY"]?.status === "pending", "legacy order kept in postgres");
    assert(saved.payload.state.users["424242"]?.status === "user", "legacy user kept");
    assert(saved.payload.state.orderIdempotency && !Array.isArray(saved.payload.state.orderIdempotency), "idempotency map stored");
    assert(saved.payload.sheet.products[0].stock === 8, "catalog stock kept");
    const backups = await client.query("SELECT id, payload FROM elfin_state WHERE id LIKE 'backup-%'");
    const mainBefore = await client.query("SELECT revision FROM elfin_state WHERE id = 'main'");
    assert(backups.rowCount === 1 && backups.rows[0].payload.state.reservations == null, "original snapshot backed up");
    assert(backups.rows[0].payload.state.users["424242"], "backup still has the legacy user");
    const mainAfterPreview = await client.query("SELECT revision FROM elfin_state WHERE id = 'main'");
    assert(mainAfterPreview.rows[0].revision === mainBefore.rows[0].revision, "reading the backup did not rewrite main");
    const open = await call(port, "/api/order/create", { method: "POST", body: { city: "HH", items: [{ productId: "north:10", quantity: 1 }] } });
    assert(open.status === 401 && open.data.error === "Authentication required", "create without session");
    const dev = await call(port, "/api/auth/dev", { method: "POST", body: { tgId: "123456789" } });
    assert(dev.status === 404, "dev auth stays closed");
    const customer = await login(port, { id: 123456789, first_name: "Клиент", username: "customer_example" });
    assert(customer.status === 200 && customer.data.token && customer.data.dev === false, "telegram session");
    const history = await call(port, "/api/order/history?city=HH", { token: customer.data.token });
    assert(history.status === 200 && Array.isArray(history.data.orders), "history after migration");
    const created = await call(port, "/api/order/create", {
      method: "POST",
      token: customer.data.token,
      headers: { "Idempotency-Key": "state-once" },
      body: { city: "HH", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
    });
    const again = await call(port, "/api/order/create", {
      method: "POST",
      token: customer.data.token,
      headers: { "Idempotency-Key": "state-once" },
      body: { city: "HH", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
    });
    assert(created.status === 200 && again.data.orderId === created.data.orderId, "same checkout key");
    const afterIdem = await mainShape(client);
    const storedIds = Object.keys(afterIdem.payload.state.orders);
    assert(storedIds.includes(created.data.orderId) && storedIds.includes("ORD-LEGACY"), "create stored and legacy remains");
    assert(storedIds.length === 2, "idempotent checkout did not insert a second order");
    const held = afterIdem.payload.state.reservations.filter((item) => item.order_id === created.data.orderId && item.released === false);
    assert(held.length === 1 && held[0].product_id === "north:10", "reservation stored");
    assert(Object.keys(afterIdem.payload.state.orderIdempotency).length === 1, "one idempotency record");
    record("order", true, `POST /api/order/create ${created.status} ${created.data.orderId}`);
    record("F", true, "identical checkout");
    const [left, right] = await Promise.all([
      call(port, "/api/order/create", {
        method: "POST",
        token: customer.data.token,
        headers: { "Idempotency-Key": "state-left" },
        body: { city: "HH", items: [{ productId: "north:10", quantity: 1 }] },
      }),
      call(port, "/api/order/create", {
        method: "POST",
        token: customer.data.token,
        headers: { "Idempotency-Key": "state-right" },
        body: { city: "HH", items: [{ productId: "north:10", quantity: 1 }] },
      }),
    ]);
    assert(left.status === 200 && right.status === 200 && left.data.orderId !== right.data.orderId, "concurrent creates");
    const concurrent = await mainShape(client);
    assert(concurrent.payload.state.orders[left.data.orderId] && concurrent.payload.state.orders[right.data.orderId], "both concurrent orders stored");
    record("G-http", true, "two concurrent order requests");
    const confirmBody = {
      city: "HH",
      deliveryMethod: "pickup",
      courier_id: "courier-north",
      delivery_date: "2026-10-15",
      delivery_time: "12:00",
      courierData: { address: "Северный вход", comment: "", user: { username: "customer_example" } },
    };
    const confirmed = await call(port, "/api/order/confirm", {
      method: "POST",
      token: customer.data.token,
      body: { ...confirmBody, orderId: created.data.orderId },
    });
    assert(confirmed.status === 200 && confirmed.data.status === "pending", "confirm");
    const placed = await mainShape(client);
    const placedOrder = placed.payload.state.orders[created.data.orderId];
    const note = placed.payload.state.notices.find((item) => item.order_id === created.data.orderId);
    assert(placedOrder.courier_id === "courier-north", "courier assigned");
    assert(note && note.sent === false && note.status === "blocked" && note.last_error === "TEST_RECIPIENT_BLOCKED", "notice blocked before Telegram");
    record("notice", true, `status=${note.status} sent=${note.sent}`);
    const courierLogin = await login(port, { id: 100000001, first_name: "Север", username: "courier_north" });
    assert(courierLogin.status === 200 && courierLogin.data.user.status === "courier", "courier session");
    const stranger = await call(port, "/api/courier/orders/status", {
      method: "POST",
      token: customer.data.token,
      body: { city: "HH", orderId: created.data.orderId, status: "delivered" },
    });
    assert(stranger.status === 403, "customer cannot deliver");
    const cancelled = await call(port, "/api/courier/orders/status", {
      method: "POST",
      token: courierLogin.data.token,
      body: { city: "HH", orderId: created.data.orderId, status: "cancelled", reason: "тест" },
    });
    const cancelledAgain = await call(port, "/api/courier/orders/status", {
      method: "POST",
      token: courierLogin.data.token,
      body: { city: "HH", orderId: created.data.orderId, status: "cancelled", reason: "тест" },
    });
    assert(cancelled.status === 200 && cancelled.data.status === "cancelled", "cancel once");
    assert(cancelledAgain.status === 400, "cancel twice refused");
    const storedCancel = await mainShape(client);
    assert(storedCancel.payload.state.orders[created.data.orderId].status === "cancelled", "cancel stored");
    record("I", true, "cancel twice");
    const deliveredOrder = await call(port, "/api/order/create", {
      method: "POST",
      token: customer.data.token,
      headers: { "Idempotency-Key": "state-deliver" },
      body: { city: "HH", items: [{ productId: "north:10", quantity: 1 }] },
    });
    const deliveredConfirm = await call(port, "/api/order/confirm", {
      method: "POST",
      token: customer.data.token,
      body: { ...confirmBody, orderId: deliveredOrder.data.orderId },
    });
    const delivered = await call(port, "/api/courier/orders/status", {
      method: "POST",
      token: courierLogin.data.token,
      body: { city: "HH", orderId: deliveredOrder.data.orderId, status: "delivered" },
    });
    const deliveredAgain = await call(port, "/api/courier/orders/status", {
      method: "POST",
      token: courierLogin.data.token,
      body: { city: "HH", orderId: deliveredOrder.data.orderId, status: "delivered" },
    });
    assert(deliveredConfirm.status === 200 && delivered.status === 200 && delivered.data.status === "delivered", "delivered once");
    assert(deliveredAgain.status === 400 && deliveredAgain.data.error === "Заказ уже завершён", "delivered twice refused");
    record("J", true, "delivered twice");
    record("order-flow", true, "create confirm courier");
    await stopServer(child);
    child = startApi(dir, port);
    const restarted = await waitReady(port, child);
    assert(restarted.stateSchema === 1 && restarted.reservationCleanup === "ok", "schema after restart");
    const restartLog = child.readLog();
    assert(!restartLog.includes("Reservation cleanup error") && restartLog.includes("Reservation cleanup: ok"), "second boot cleanup");
    assert(!restartLog.includes("State migration:"), "second boot does not migrate again");
    const againLogin = await login(port, { id: 123456789, first_name: "Клиент", username: "customer_example" });
    const againHistory = await call(port, "/api/order/history?city=HH", { token: againLogin.data.token });
    const ids = againHistory.data.orders.map((order) => order.orderId);
    assert(ids.includes(created.data.orderId) && ids.includes(deliveredOrder.data.orderId), "orders survive restart");
    const persisted = await mainShape(client);
    assert(persisted.payload.state.orders[created.data.orderId] && persisted.payload.state.orders["ORD-LEGACY"], "postgres still has both orders");
    assert(persisted.payload.state.schemaVersion === 1 && persisted.payload.state.users["424242"], "legacy user survived restart");
    const backupCount = await client.query("SELECT count(*)::int AS count FROM elfin_state WHERE id LIKE 'backup-%'");
    assert(backupCount.rows[0].count === 1, "restart did not add another backup");
    assert(!child.readLog().includes("not iterable"), "restart cleanup has no TypeError");
    record("K", true, "restart persistence");
    await stopServer(child);
    child = null;
    const beforeBackups = await client.query("SELECT count(*)::int AS count FROM elfin_state WHERE id LIKE 'backup-%'");
    await client.query("UPDATE elfin_state SET payload = jsonb_set(payload, '{state,reservations}', '5'::jsonb) WHERE id = 'main'");
    const refused = startApi(dir, port);
    const exitCode = await Promise.race([
      new Promise((resolve) => refused.once("exit", resolve)),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000)),
    ]);
    if (refused.exitCode == null) refused.kill("SIGKILL");
    const after = await mainShape(client);
    const afterBackups = await client.query("SELECT count(*)::int AS count FROM elfin_state WHERE id LIKE 'backup-%'");
    assert(exitCode === 1, "bad snapshot stops boot");
    assert(after.payload.state.reservations === 5, "bad snapshot was not overwritten");
    assert(after.payload.state.orders["ORD-LEGACY"], "orders remain when migration stops");
    assert(afterBackups.rows[0].count === beforeBackups.rows[0].count, "stopped migration does not write a backup");
    record("C-db", true, "postgres keeps an unconvertible snapshot");
    await client.query("DELETE FROM elfin_state WHERE id = 'main'");
    await client.query("INSERT INTO elfin_state (id, payload, revision) VALUES ('main', $1::jsonb, 1)", [JSON.stringify(wrap(fullState(), { products: [product()], couriers: [courier()], orders: [], liquidPrices: {} }))]);
    const work = mkdtempSync(path.join(tmpdir(), "elfin-writers-"));
    const go = path.join(work, "go");
    const writers = ["ORD-LEFT", "ORD-RIGHT"].map((id) => {
      const ready = path.join(work, `${id}.ready`);
      const writer = spawn(process.execPath, ["server/state.test.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STATE_WRITER: "1",
          ORDER_ID: id,
          READY_FILE: ready,
          GO_FILE: go,
          DATABASE_URL: databaseUrl,
          DATA_DIR: path.join(work, id),
          NODE_ENV: "test",
          JWT_SECRET: "state-test-secret",
          CITY_CODE: "HH",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { id, ready, writer };
    });
    const writerStarted = Date.now();
    while (writers.some((item) => !fs.existsSync(item.ready))) {
      if (Date.now() - writerStarted > 8000) throw new Error("writers did not hydrate");
      if (writers.some((item) => item.writer.exitCode != null)) throw new Error("writer exited before the race");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    fs.writeFileSync(go, "go");
    const codes = await Promise.all(writers.map((item) => new Promise((resolve) => item.writer.once("exit", resolve))));
    assert(codes.every((code) => code === 0), "writers saved");
    const raced = await mainShape(client);
    assert(raced.payload.state.orders["ORD-LEFT"] && raced.payload.state.orders["ORD-RIGHT"], "two processes did not drop an order");
    record("G-race", true, "two processes keep both orders");
  } finally {
    await stopServer(child);
    await client.end();
  }
}

try {
  await runIntegration();
} catch (error) {
  record("integration", false, error.message);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("state schema ok");
}

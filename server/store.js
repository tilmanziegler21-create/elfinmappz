import fs from "fs";
import path from "path";
import { hydrateFromPostgres, queueSnapshot } from "./pgState.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const stateFile = path.join(dataDir, "state.json");
const sheetFile = path.join(dataDir, "workbook.json");
const checkpointFile = path.join(dataDir, "checkpoint.json");

const ORDER_COLUMNS = [
  "order_id", "user_id", "status", "total_amount", "subtotal_amount", "discount_amount", "promo_code",
  "courier_id", "delivery_date", "delivery_time", "delivery_method", "payment_method", "bonus_applied",
  "final_amount", "created_at", "delivered_at", "cancelled_at", "cancel_reason", "item_count", "items_json",
  "user_name", "user_phone", "delivery_address", "comment", "stock_committed",
];

function emptyState() {
  return {
    users: {},
    orders: {},
    items: [],
    reservations: [],
    promos: [],
    orderIdempotency: {},
    paymentIdempotency: {},
    notices: [],
    stockMoves: [],
  };
}

function seedSheet() {
  return {
    products: [
      { sku: "north:10", name: "Северный", category: "Мята", price: 9.9, stock: 8, active: true, brand: "ELFIN" },
      { sku: "north:30", name: "Северный", category: "Мята", price: 16.5, stock: 2, active: true, brand: "ELFIN" },
      { sku: "north:50", name: "Северный", category: "Мята", price: 24, stock: 0, active: false, brand: "ELFIN" },
      { sku: "clear:10", name: "Ясный", category: "Ягода", price: 8.5, stock: 6, active: true, brand: "ELFIN" },
      { sku: "clear:30", name: "Ясный", category: "Ягода", price: 14, stock: 0, active: false, brand: "ELFIN" },
      { sku: "quiet:10", name: "Тихий", category: "Холод", price: 10, stock: 3, active: true, brand: "ELFIN" },
      { sku: "snow:10", name: "Первый снег", category: "Мята", price: 9.5, stock: 0, active: false, brand: "ELFIN" },
      { sku: "sapphire:10", name: "Сапфир", category: "Ягода", price: 11, stock: 5, active: true, brand: "ELFIN" },
      { sku: "sapphire:30", name: "Сапфир", category: "Ягода", price: 19, stock: 4, active: true, brand: "ELFIN" },
      { sku: "frost:10", name: "Иней", category: "Холод", price: 8.9, stock: 7, active: true, brand: "ELFIN" },
    ],
    couriers: [
      { courier_id: "courier-north", name: "Север", tg_id: "100000001", active: true, time_from: "12:00", time_to: "18:00", meeting_place: "Северный вход", phone: "491701112233" },
      { courier_id: "courier-frost", name: "Иней", tg_id: "100000002", active: true, time_from: "18:00", time_to: "23:00", meeting_place: "", phone: "491709998877" },
      { courier_id: "courier-quiet", name: "Тихий", tg_id: "100000003", active: false, time_from: "10:00", time_to: "14:00", meeting_place: "", phone: "" },
    ],
    orders: [],
    liquidPrices: {},
  };
}

function seedUsers() {
  return {
    "123456789": { tg_id: "123456789", username: "customer_example", first_name: "Клиент", status: "user", bonus_balance: 0, level_percent: 0, deferred_discount: 0, referred_by: "", referral_conversions: 0, first_paid_order_at: "" },
    "100000001": { tg_id: "100000001", username: "courier_north", first_name: "Север", status: "courier", bonus_balance: 0, level_percent: 0, deferred_discount: 0, referred_by: "", referral_conversions: 0, first_paid_order_at: "" },
    "100000002": { tg_id: "100000002", username: "courier_frost", first_name: "Иней", status: "courier", bonus_balance: 0, level_percent: 0, deferred_discount: 0, referred_by: "", referral_conversions: 0, first_paid_order_at: "" },
    "100000009": { tg_id: "100000009", username: "elfin_admin", first_name: "Админ", status: "admin", bonus_balance: 0, level_percent: 0, deferred_discount: 0, referred_by: "", referral_conversions: 0, first_paid_order_at: "" },
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback();
  }
}

function writeJson(file, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadPair() {
  const checkpoint = readJson(checkpointFile, () => null);
  if (checkpoint?.state && checkpoint?.sheet) return checkpoint;
  return { state: readJson(stateFile, emptyState), sheet: readJson(sheetFile, seedSheet) };
}

const loaded = loadPair();
const state = loaded.state;
const sheet = loaded.sheet;

function ensureShape() {
  if (!Object.keys(state.users || {}).length) state.users = seedUsers();
  if (!Array.isArray(state.stockMoves)) state.stockMoves = [];
  if (!Array.isArray(state.notices)) state.notices = [];
  if (!Array.isArray(state.tickets)) state.tickets = [];
  if (!sheet.products?.length) Object.assign(sheet, seedSheet());
}

function replaceContents(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

ensureShape();

export async function hydrateStore() {
  if (!String(process.env.DATABASE_URL || "").trim()) return "ephemeral";
  const payload = await hydrateFromPostgres({ state, sheet });
  if (payload?.state && payload?.sheet) {
    replaceContents(state, payload.state);
    replaceContents(sheet, payload.sheet);
    ensureShape();
  }
  return "persistent";
}

export function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${checkpointFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ state, sheet }));
  fs.renameSync(tmp, checkpointFile);
  writeJson(stateFile, state);
  writeJson(sheetFile, sheet);
  if (String(process.env.DATABASE_URL || "").trim()) queueSnapshot({ state, sheet });
}

export function db() {
  return state;
}

export function workbook() {
  return sheet;
}

export function orderColumns() {
  return ORDER_COLUMNS;
}

export function blankOrderRow(partial) {
  const row = {};
  for (const key of ORDER_COLUMNS) row[key] = "";
  return { ...row, ...partial };
}

export function upsertOrderRow(partial) {
  const index = sheet.orders.findIndex((item) => String(item.order_id) === String(partial.order_id));
  if (index >= 0) sheet.orders[index] = { ...sheet.orders[index], ...partial };
  else sheet.orders.push(blankOrderRow(partial));
  persist();
  return sheet.orders[index >= 0 ? index : sheet.orders.length - 1];
}

export function activeReservations(sku) {
  const now = Date.now();
  return state.reservations.filter((item) => item.product_id === sku && item.released === false && item.expiry_ms > now);
}

export function addReservation(orderId, sku, qty, ttlMs) {
  state.reservations.push({
    order_id: orderId,
    product_id: sku,
    qty,
    released: false,
    expiry_ms: Date.now() + ttlMs,
  });
}

export function releaseReservations(orderId) {
  for (const item of state.reservations) {
    if (item.order_id === orderId) item.released = true;
  }
}

export function adjustStock(lines, sign) {
  for (const line of lines) {
    const product = sheet.products.find((item) => item.sku === line.sku);
    if (!product) continue;
    product.stock = Math.max(0, Number(product.stock) + sign * Number(line.qty));
    product.active = product.stock > 0;
  }
}

const tails = new Map();

export function withOrderLock(orderId, fn) {
  const previous = tails.get(orderId) || Promise.resolve();
  const run = previous.then(() => fn(), () => fn());
  const tracked = run.finally(() => {
    if (tails.get(orderId) === tracked) tails.delete(orderId);
  });
  tails.set(orderId, tracked);
  return tracked;
}

export function expireReservations() {
  const now = Date.now();
  const expired = new Set();
  for (const item of state.reservations) {
    if (item.released === false && item.expiry_ms <= now) {
      item.released = true;
      expired.add(item.order_id);
    }
  }
  const cancelled = [];
  for (const orderId of expired) {
    const order = state.orders[orderId];
    if (!order) continue;
    if (order.stock_committed) continue;
    if (order.status !== "buffer" && order.status !== "pending") continue;
    order.status = "cancelled";
    order.cancelled_at = new Date().toISOString();
    order.cancel_reason = order.cancel_reason || "Резерв истёк";
    upsertOrderRow({
      order_id: orderId,
      status: "cancelled",
      cancelled_at: order.cancelled_at,
      cancel_reason: order.cancel_reason,
    });
    cancelled.push(orderId);
  }
  if (cancelled.length) persist();
  return cancelled;
}

persist();

export const STATE_SCHEMA = 1;

const STATUS_RANK = { buffer: 1, pending: 2, assigned: 3, picked_up: 4, cancelled: 5, delivered: 6 };
const MOVE_RANK = { pending: 1, applied: 2, done: 3 };

function stop(field) {
  const error = new Error("STATE_MIGRATION_STOPPED");
  error.code = "STATE_MIGRATION_STOPPED";
  error.field = field;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function kind(value) {
  if (value == null) return "missing";
  if (Array.isArray(value)) return `array:${value.length}`;
  if (typeof value === "object") return `object:${Object.keys(value).length}`;
  return typeof value;
}

export function describeState(state, sheet) {
  const names = ["users", "orders", "items", "reservations", "promos", "orderIdempotency", "paymentIdempotency", "notices", "stockMoves", "tickets"];
  const parts = names.map((name) => `${name}=${kind(state?.[name])}`);
  parts.push(`schemaVersion=${Number(state?.schemaVersion || 0)}`);
  parts.push(`sheet.orders=${kind(sheet?.orders)}`);
  parts.push(`sheet.products=${kind(sheet?.products)}`);
  parts.push(`sheet.couriers=${kind(sheet?.couriers)}`);
  return parts.join(" ");
}

function asMap(value, field, idKeys) {
  if (value == null) return { map: {}, action: "filled" };
  if (isRecord(value)) return { map: value, action: "keep" };
  if (!Array.isArray(value)) stop(field);
  const map = {};
  for (const entry of value) {
    if (!isRecord(entry)) stop(field);
    const id = idKeys.map((key) => entry[key]).find((item) => item != null && String(item).trim());
    if (id == null) stop(field);
    const key = String(id);
    if (map[key]) stop(field);
    if (field === "orders" && entry.id == null) entry.id = key;
    map[key] = entry;
  }
  return { map, action: "converted" };
}

function asRecordList(value, field) {
  if (value == null) return { list: [], action: "filled" };
  if (Array.isArray(value)) {
    if (value.some((item) => !isRecord(item))) stop(field);
    return { list: value, action: "keep" };
  }
  if (!isRecord(value)) stop(field);
  const entries = Object.values(value);
  if (entries.some((item) => !isRecord(item))) stop(field);
  return { list: entries, action: "converted" };
}

function asReservations(value) {
  if (value == null) return { list: [], action: "filled" };
  if (Array.isArray(value)) {
    if (value.some((item) => !isRecord(item))) stop("reservations");
    return { list: value, action: "keep" };
  }
  if (!isRecord(value)) stop("reservations");
  const entries = Object.values(value);
  if (entries.length === 0) return { list: [], action: "converted" };
  const list = [];
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      if (entry.some((item) => !isRecord(item))) stop("reservations");
      list.push(...entry);
      continue;
    }
    if (!isRecord(entry)) stop("reservations");
    const orderId = entry.order_id || entry.orderId;
    const productId = entry.product_id || entry.productId || entry.sku;
    if (!orderId || !productId) stop("reservations");
    list.push({ ...entry, order_id: String(orderId), product_id: String(productId) });
  }
  return { list, action: "converted" };
}

function assign(report, field, result) {
  if (result.action === "filled") report.filled.push(field);
  if (result.action === "converted") report.converted.push(field);
  return result;
}

function asSheetRows(sheet, key, idKeys) {
  const field = `sheet.${key}`;
  const value = sheet[key];
  if (value == null) return { list: [], action: "filled", field };
  if (Array.isArray(value)) {
    if (value.some((item) => !isRecord(item))) stop(field);
    return { list: value, action: "keep", field };
  }
  if (!isRecord(value)) stop(field);
  const entries = Object.values(value);
  if (entries.some((item) => !isRecord(item) || !idKeys.some((id) => item[id] != null && String(item[id]).trim()))) stop(field);
  return { list: entries, action: "converted", field };
}

export function normalizeSnapshot(state, sheet) {
  if (!isRecord(state)) stop("state");
  if (!isRecord(sheet)) stop("sheet");
  const report = { filled: [], converted: [], schemaVersion: STATE_SCHEMA, previousVersion: Number(state.schemaVersion || 0) };
  const users = assign(report, "users", asMap(state.users, "users", ["tg_id", "tgId", "id"]));
  const orders = assign(report, "orders", asMap(state.orders, "orders", ["id", "order_id"]));
  const reservations = assign(report, "reservations", asReservations(state.reservations));
  const items = assign(report, "items", asRecordList(state.items, "items"));
  const promos = assign(report, "promos", asRecordList(state.promos, "promos"));
  const notices = assign(report, "notices", asRecordList(state.notices, "notices"));
  const stockMoves = assign(report, "stockMoves", asRecordList(state.stockMoves, "stockMoves"));
  const tickets = assign(report, "tickets", asRecordList(state.tickets, "tickets"));
  const orderIdempotency = assign(report, "orderIdempotency", asMap(state.orderIdempotency, "orderIdempotency", ["key", "id"]));
  const paymentIdempotency = assign(report, "paymentIdempotency", asMap(state.paymentIdempotency, "paymentIdempotency", ["key", "id"]));
  const sheetOrders = asSheetRows(sheet, "orders", ["order_id", "id"]);
  const sheetProducts = asSheetRows(sheet, "products", ["sku"]);
  const sheetCouriers = asSheetRows(sheet, "couriers", ["courier_id"]);
  assign(report, sheetOrders.field, sheetOrders);
  assign(report, sheetProducts.field, sheetProducts);
  assign(report, sheetCouriers.field, sheetCouriers);
  let prices = sheet.liquidPrices;
  let priceAction = "keep";
  if (prices == null) {
    prices = {};
    priceAction = "filled";
  } else if (!isRecord(prices)) stop("sheet.liquidPrices");
  if (priceAction === "filled") report.filled.push("sheet.liquidPrices");
  state.users = users.map;
  state.orders = orders.map;
  state.reservations = reservations.list;
  state.items = items.list;
  state.promos = promos.list;
  state.notices = notices.list;
  state.stockMoves = stockMoves.list;
  state.tickets = tickets.list;
  state.orderIdempotency = orderIdempotency.map;
  state.paymentIdempotency = paymentIdempotency.map;
  sheet.orders = sheetOrders.list;
  sheet.products = sheetProducts.list;
  sheet.couriers = sheetCouriers.list;
  sheet.liquidPrices = prices;
  report.changed = report.filled.length > 0 || report.converted.length > 0 || report.previousVersion !== STATE_SCHEMA;
  state.schemaVersion = STATE_SCHEMA;
  return report;
}

function blankFill(primary, secondary) {
  const merged = { ...secondary, ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if ((merged[key] === "" || merged[key] == null) && value !== "" && value != null) merged[key] = value;
  }
  return merged;
}

function mergeUser(remote, local) {
  return blankFill(local, remote);
}

function mergeOrder(remote, local) {
  const remoteRank = STATUS_RANK[remote?.status] || 0;
  const localRank = STATUS_RANK[local?.status] || 0;
  const primary = localRank >= remoteRank ? local : remote;
  const secondary = primary === local ? remote : local;
  return blankFill(primary, secondary);
}

function mergeMove(remote, local) {
  const remoteRank = MOVE_RANK[remote?.status] || 0;
  const localRank = MOVE_RANK[local?.status] || 0;
  const primary = localRank >= remoteRank ? local : remote;
  const secondary = primary === local ? remote : local;
  return { ...secondary, ...primary };
}

function mergeIdempotency(remote, local) {
  const out = { ...(remote || {}) };
  for (const [key, value] of Object.entries(local || {})) {
    const prev = out[key];
    if (!prev) out[key] = value;
    else if (value?.payload && !prev.payload) out[key] = value;
    else if (prev.payload && !value?.payload) out[key] = prev;
    else out[key] = Number(value?.expiresAt || 0) >= Number(prev?.expiresAt || 0) ? value : prev;
  }
  return out;
}

function rowKey(row, keyFn) {
  return String(keyFn(row) || "");
}

function mergeRows(remote, local, keyFn, mergeFn) {
  const out = [];
  const seen = new Map();
  for (const row of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    if (!isRecord(row)) stop("rows");
    const key = rowKey(row, keyFn);
    if (!key) {
      out.push({ ...row });
      continue;
    }
    if (!seen.has(key)) {
      const copy = { ...row };
      seen.set(key, copy);
      out.push(copy);
    } else if (mergeFn) {
      Object.assign(seen.get(key), mergeFn(seen.get(key), row));
    } else {
      Object.assign(seen.get(key), row);
    }
  }
  return out;
}

function mergeReservations(remote, local) {
  const seen = new Map();
  for (const item of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    if (!isRecord(item)) stop("reservations");
    const key = `${item.order_id}|${item.product_id}|${item.expiry_ms}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, { ...item });
    else seen.set(key, { ...prev, ...item, released: prev.released === true || item.released === true });
  }
  return [...seen.values()];
}

function mergeProducts(remote, local) {
  const seen = new Map();
  for (const row of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    if (!isRecord(row) || !row.sku) stop("sheet.products");
    const prev = seen.get(String(row.sku));
    if (!prev) {
      seen.set(String(row.sku), { ...row });
      continue;
    }
    const left = Number(prev.stock);
    const right = Number(row.stock);
    const stock = Number.isFinite(left) && Number.isFinite(right) ? Math.min(left, right) : (Number.isFinite(right) ? right : left);
    seen.set(String(row.sku), { ...prev, ...row, stock, active: Number(stock) > 0 });
  }
  return [...seen.values()];
}

function namedMap(remote, local, mergeFn) {
  const out = {};
  for (const key of new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])) {
    if (remote?.[key] && local?.[key]) out[key] = mergeFn(remote[key], local[key]);
    else out[key] = { ...(remote?.[key] || local?.[key]) };
  }
  return out;
}

function unwrap(snapshot) {
  if (isRecord(snapshot?.state) && isRecord(snapshot?.sheet)) return JSON.parse(JSON.stringify(snapshot));
  if (isRecord(snapshot) && ["users", "orders", "reservations", "items", "orderIdempotency"].some((key) => key in snapshot)) {
    return {
      state: JSON.parse(JSON.stringify(snapshot)),
      sheet: { products: [], couriers: [], orders: [], liquidPrices: {} },
    };
  }
  stop("payload");
}

export function mergeSnapshots(remote, local) {
  const left = unwrap(remote);
  const right = unwrap(local);
  normalizeSnapshot(left.state, left.sheet);
  normalizeSnapshot(right.state, right.sheet);
  const state = {
    users: namedMap(left.state.users, right.state.users, mergeUser),
    orders: namedMap(left.state.orders, right.state.orders, mergeOrder),
    items: mergeRows(left.state.items, right.state.items, (row) => `${row.order_id}|${row.productId || row.product_id}|${row.variant || ""}`),
    reservations: mergeReservations(left.state.reservations, right.state.reservations),
    promos: mergeRows(left.state.promos, right.state.promos, (row) => String(row.code || row.id || "")),
    orderIdempotency: mergeIdempotency(left.state.orderIdempotency, right.state.orderIdempotency),
    paymentIdempotency: mergeIdempotency(left.state.paymentIdempotency, right.state.paymentIdempotency),
    notices: mergeRows(left.state.notices, right.state.notices, (row) => String(row.id || "")),
    stockMoves: mergeRows(left.state.stockMoves, right.state.stockMoves, (row) => String(row.id || ""), mergeMove),
    tickets: mergeRows(left.state.tickets, right.state.tickets, (row) => String(row.id || "")),
    schemaVersion: STATE_SCHEMA,
  };
  const sheet = {
    products: mergeProducts(left.sheet.products, right.sheet.products),
    couriers: mergeRows(left.sheet.couriers, right.sheet.couriers, (row) => String(row.courier_id || "")),
    orders: mergeRows(left.sheet.orders, right.sheet.orders, (row) => String(row.order_id || row.id || ""), mergeOrder),
    liquidPrices: { ...(left.sheet.liquidPrices || {}), ...(right.sheet.liquidPrices || {}) },
  };
  normalizeSnapshot(state, sheet);
  return { state, sheet };
}

export function expireReservationRecords(reservations, orders, now) {
  if (!Array.isArray(reservations)) {
    const error = new Error("reservations is not iterable");
    error.code = "STATE_RESERVATIONS_INVALID";
    throw error;
  }
  if (!isRecord(orders)) {
    const error = new Error("orders is not an object");
    error.code = "STATE_ORDERS_INVALID";
    throw error;
  }
  const expired = new Set();
  for (const item of reservations) {
    if (!item || item.released !== false) continue;
    if (!(Number(item.expiry_ms) <= now)) continue;
    item.released = true;
    if (item.order_id) expired.add(item.order_id);
  }
  const cancelled = [];
  for (const orderId of expired) {
    const order = orders[orderId];
    if (!order) continue;
    if (order.stock_committed) continue;
    if (order.status !== "buffer" && order.status !== "pending") continue;
    order.status = "cancelled";
    order.cancelled_at = new Date(now).toISOString();
    order.cancel_reason = order.cancel_reason || "Резерв истёк";
    cancelled.push(orderId);
  }
  return cancelled;
}

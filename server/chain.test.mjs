import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.NODE_ENV = "test";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "elfin-"));
process.env.JWT_SECRET = "test-secret";
process.env.ALLOW_DEV_AUTH = "1";
process.env.CITY_CODE = "one";
process.env.BONUS_CASHBACK_PERCENT = "10";

const { app } = await import("./index.js");
const { db, expireReservations, workbook } = await import("./store.js");

const server = await new Promise((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function call(urlPath, { method = "GET", token, body, headers } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const customer = await call("/api/auth/dev", { method: "POST", body: { tgId: "123456789" } });
const token = customer.data.token;
const northAuth = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000001" } });
const frostAuth = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000002" } });
const adminAuth = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000009" } });

const stockBefore = workbook().products.find((item) => item.sku === "north:10").stock;
const created = await call("/api/order/create", {
  method: "POST",
  token,
  headers: { "Idempotency-Key": "same-key" },
  body: { city: "one", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }], promoCode: "" },
});
assert(created.status === 200 && created.data.status === "buffer", "create buffer");
const again = await call("/api/order/create", {
  method: "POST",
  token,
  headers: { "Idempotency-Key": "same-key" },
  body: { city: "one", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
});
assert(again.data.orderId === created.data.orderId, "idempotent create");
assert(workbook().products.find((item) => item.sku === "north:10").stock === stockBefore, "create does not deduct");

const missing = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "missing", quantity: 1 }] },
});
assert(missing.status === 404, "missing product");
const closed = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "north:50", quantity: 1 }] },
});
assert(closed.status === 404, "inactive product");

const confirmed = await call("/api/order/confirm", {
  method: "POST",
  token,
  body: {
    orderId: created.data.orderId,
    city: "one",
    deliveryMethod: "pickup",
    courier_id: "courier-north",
    delivery_date: "2026-10-15",
    delivery_time: "12:00",
    courierData: { address: "другая точка", comment: "у входа", user: { tgId: "123456789", username: "customer_example" } },
  },
});
assert(confirmed.data.status === "pending", "confirm pending");
const stockAfter = workbook().products.find((item) => item.sku === "north:10").stock;
assert(stockAfter === stockBefore - 1, "confirm deducts once");
const row = workbook().orders.find((item) => item.order_id === created.data.orderId);
assert(row.delivery_address === "Северный вход", "pickup uses meeting place");
assert(row.stock_committed === "TRUE", "stock flag");
await call("/api/order/confirm", {
  method: "POST",
  token,
  body: {
    orderId: created.data.orderId,
    city: "one",
    deliveryMethod: "pickup",
    courier_id: "courier-north",
    delivery_date: "2026-10-15",
    delivery_time: "12:00",
    courierData: { address: "Северный вход", comment: "у входа", user: { tgId: "123456789", username: "customer_example" } },
  },
});
assert(workbook().products.find((item) => item.sku === "north:10").stock === stockAfter, "second confirm does not deduct");
assert(db().notices.length === 1, "courier notice once");

const paid = await call("/api/order/payment", {
  method: "POST",
  token,
  body: { orderId: created.data.orderId, city: "one", paymentMethod: "cash", bonusApplied: 0 },
});
assert(paid.data.paymentMethod === "cash" && paid.data.status === "pending", "payment records cash");
const paidAgain = await call("/api/order/payment", {
  method: "POST",
  token,
  body: { orderId: created.data.orderId, city: "one", paymentMethod: "card", bonusApplied: 0 },
});
assert(paidAgain.data.paymentMethod === "cash", "payment idempotent");

const stranger = await call(`/api/courier/orders?city=one`, { token });
assert(stranger.status === 403, "customer cannot open courier orders");
const frostList = await call(`/api/courier/orders?city=one`, { token: frostAuth.data.token });
assert(frostList.data.orders.length === 0, "other courier sees nothing");
const northList = await call(`/api/courier/orders?city=one`, { token: northAuth.data.token });
assert(northList.data.orders.length === 1, "assigned courier sees the order");
const stolen = await call("/api/courier/orders/status", {
  method: "POST",
  token: frostAuth.data.token,
  body: { city: "one", orderId: created.data.orderId, status: "delivered" },
});
assert(stolen.status === 403, "foreign courier blocked");

const moved = await call("/api/admin/orders/status", {
  method: "POST",
  token: adminAuth.data.token,
  body: { city: "one", orderId: created.data.orderId, status: "assigned" },
});
assert(moved.data.status === "assigned" && moved.data.courier_id === "courier-north", "admin keeps courier");
const delivered = await call("/api/courier/orders/status", {
  method: "POST",
  token: northAuth.data.token,
  body: { city: "one", orderId: created.data.orderId, status: "delivered" },
});
assert(delivered.data.status === "delivered", "courier delivered");
assert(workbook().products.find((item) => item.sku === "north:10").stock === stockAfter, "delivered does not deduct");

const held = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "clear:10", quantity: 1, variant: "10 мл" }] },
});
const holdStock = workbook().products.find((item) => item.sku === "clear:10").stock;
db().reservations.filter((item) => item.order_id === held.data.orderId).forEach((item) => {
  item.expiry_ms = Date.now() - 1000;
});
const cancelled = expireReservations();
assert(cancelled.includes(held.data.orderId), "expired buffer cancelled");
assert(workbook().products.find((item) => item.sku === "clear:10").stock === holdStock, "expired reserve does not deduct");
expireReservations();
assert(db().orders[created.data.orderId].status === "delivered", "confirmed order survives cleanup");

db().users["123456789"].bonus_balance = 100;
const bonusOrder = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "quiet:10", quantity: 1, variant: "10 мл" }] },
});
await call("/api/order/confirm", {
  method: "POST",
  token,
  body: {
    orderId: bonusOrder.data.orderId,
    city: "one",
    deliveryMethod: "courier",
    courier_id: "courier-frost",
    delivery_date: "2026-10-15",
    delivery_time: "18:00",
    courierData: { address: "Ледяная 4", user: { tgId: "123456789", username: "customer_example" } },
  },
});
const bonusPay = await call("/api/order/payment", {
  method: "POST",
  token,
  body: { orderId: bonusOrder.data.orderId, city: "one", paymentMethod: "card", bonusApplied: 100 },
});
assert(bonusPay.data.bonusApplied === 5, "bonus capped at half");
assert(bonusPay.data.finalAmount === 5, "final after bonus");

const noReason = await call("/api/courier/orders/status", {
  method: "POST",
  token: frostAuth.data.token,
  body: { city: "one", orderId: bonusOrder.data.orderId, status: "cancelled", reason: "" },
});
assert(noReason.status === 400, "cancel needs reason");
const reason = await call("/api/courier/orders/status", {
  method: "POST",
  token: frostAuth.data.token,
  body: { city: "one", orderId: bonusOrder.data.orderId, status: "cancelled", reason: "Не дождался" },
});
assert(reason.data.status === "cancelled", "cancel with reason");

server.close();
console.log("chain ok");

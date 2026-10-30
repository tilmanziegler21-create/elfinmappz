import { spawn } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const results = [];
function record(id, name, ok, detail) {
  results.push({ id, name, status: ok ? "pass" : "fail", detail });
  console.log(`${ok ? "PASS" : "FAIL"}\t${id}\t${detail}`);
}

const restartDir = mkdtempSync(path.join(tmpdir(), "elfin-restart-"));
const restartPort = 8791;

function startServer(dir, port) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATA_DIR: dir,
      PORT: String(port),
      JWT_SECRET: "reliability-secret",
      ALLOW_DEV_AUTH: "1",
      CITY_CODE: "one",
      CITY_CODES: "one",
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
  child.log = () => log;
  return child;
}

async function waitReady(port) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (response.ok) return;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("API не поднялся");
}

async function stopServer(child) {
  if (child.exitCode != null) return child.exitCode;
  child.kill("SIGTERM");
  const code = await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(() => {
      child.kill("SIGKILL");
      resolve("sigkill");
    }, 2000)),
  ]);
  return code;
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

async function auth(port, tgId) {
  const response = await call(port, "/api/auth/dev", { method: "POST", body: { tgId } });
  if (!response.data.token) throw new Error(`нет токена для ${tgId}`);
  return response.data.token;
}

const restart = startServer(restartDir, restartPort);
try {
  await waitReady(restartPort);
  const token = await auth(restartPort, "123456789");
  const created = await call(restartPort, "/api/order/create", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": "restart-key" },
    body: { city: "one", items: [{ productId: "sapphire:10", quantity: 1, variant: "10 мл", price: 0.01, totalAmount: 0.01 }] },
  });
  await call(restartPort, "/api/order/confirm", {
    method: "POST",
    token,
    body: {
      orderId: created.data.orderId,
      city: "one",
      deliveryMethod: "courier",
      courier_id: "courier-north",
      delivery_date: "2026-10-15",
      delivery_time: "12:00",
      status: "delivered",
      courier_id_override: "courier-frost",
      courierData: { address: "Ледяная 4", comment: "тест", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  await call(restartPort, "/api/order/payment", {
    method: "POST",
    token,
    body: { orderId: created.data.orderId, city: "one", paymentMethod: "cash", bonusApplied: 0, totalAmount: 1 },
  });
} finally {
  const exitCode = await stopServer(restart);
  record("restart-stop", "Остановка API по SIGTERM", exitCode !== "sigkill", `код выхода: ${exitCode}`);
}

const diskBefore = JSON.parse(readFileSync(path.join(restartDir, "state.json"), "utf8"));
const sheetBefore = JSON.parse(readFileSync(path.join(restartDir, "workbook.json"), "utf8"));
const savedOrder = Object.values(diskBefore.orders)[0];
const savedStock = sheetBefore.products.find((item) => item.sku === "sapphire:10").stock;
record("restart-disk", "Заказ и склад записаны на диск до второго запуска", Boolean(savedOrder) && savedStock === 4, `статус ${savedOrder?.status}, склад sapphire:10 = ${savedStock}`);

const restarted = startServer(restartDir, restartPort);
try {
  await waitReady(restartPort);
  const token = await auth(restartPort, "123456789");
  const north = await auth(restartPort, "100000001");
  const history = await call(restartPort, "/api/order/history?city=one", { token });
  const again = history.data.orders?.find((item) => item.orderId === savedOrder.id);
  record("restart-read", "После перезапуска заказ на месте", again?.status === "pending" && again?.courierId === "courier-north" && again?.totalAmount === 11, JSON.stringify(again));
  const sheetAfter = JSON.parse(readFileSync(path.join(restartDir, "workbook.json"), "utf8"));
  record("restart-stock", "После перезапуска списание не повторилось", sheetAfter.products.find((item) => item.sku === "sapphire:10").stock === 4, `склад ${sheetAfter.products.find((item) => item.sku === "sapphire:10").stock}`);
  const delivered = await call(restartPort, "/api/courier/orders/status", {
    method: "POST",
    token: north,
    body: { city: "one", orderId: savedOrder.id, status: "delivered" },
  });
  const deliveredAgain = await call(restartPort, "/api/courier/orders/status", {
    method: "POST",
    token: north,
    body: { city: "one", orderId: savedOrder.id, status: "delivered" },
  });
  const stockAfterDeliver = JSON.parse(readFileSync(path.join(restartDir, "workbook.json"), "utf8")).products.find((item) => item.sku === "sapphire:10").stock;
  record("deliver-repeat", "Повторное «Выдал» не списывает склад", delivered.status === 200 && deliveredAgain.status === 400 && stockAfterDeliver === 4, `первый ${delivered.status}, повтор ${deliveredAgain.status}, склад ${stockAfterDeliver}`);
} finally {
  await stopServer(restarted);
}

process.env.NODE_ENV = "test";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "elfin-life-"));
process.env.JWT_SECRET = "reliability-secret";
process.env.ALLOW_DEV_AUTH = "1";
process.env.CITY_CODE = "one";
process.env.CITY_CODES = "one";
process.env.PORT = "0";

const { app } = await import("./index.js");
const { db, expireReservations, workbook } = await import("./store.js");
const server = await new Promise((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const port = server.address().port;

try {
  const customer = await auth(port, "123456789");
  const north = await auth(port, "100000001");
  const frost = await auth(port, "100000002");
  const admin = await auth(port, "100000009");

  const created = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    headers: { "Idempotency-Key": "one-order" },
    body: { city: "one", items: [{ productId: "frost:10", quantity: 2, variant: "10 мл", price: 1 }], totalAmount: 1 },
  });
  const duplicate = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    headers: { "Idempotency-Key": "one-order" },
    body: { city: "one", items: [{ productId: "frost:10", quantity: 2, variant: "10 мл" }] },
  });
  const orderCount = Object.keys(db().orders).length;
  record("create-one", "Один ключ создаёт один заказ", created.data.orderId && created.data.orderId === duplicate.data.orderId && orderCount === 1, `id ${created.data.orderId}, заказов ${orderCount}`);
  const order = db().orders[created.data.orderId];
  record("create-sum", "Сумма берётся из каталога, не из клиента", created.data.totalAmount === 17.8 && order.total_amount === 17.8, `ответ ${created.data.totalAmount}`);
  record("create-customer", "Данные покупателя сохранены", order.user_id === "123456789" && order.username === "customer_example" && order.user_name === "Клиент" && order.display_number >= 1001 && created.data.displayNumber === order.display_number && duplicate.data.displayNumber === order.display_number, `${order.user_id} ${order.username} #${order.display_number}`);
  const reserved = db().reservations.filter((item) => item.order_id === order.id && item.released === false).reduce((sum, item) => sum + item.qty, 0);
  record("reserve-qty", "Резерв равен количеству, склад ещё не уменьшен", reserved === 2 && workbook().products.find((item) => item.sku === "frost:10").stock === 7, `резерв ${reserved}, склад ${workbook().products.find((item) => item.sku === "frost:10").stock}`);

  const confirmed = await call(port, "/api/order/confirm", {
    method: "POST",
    token: customer,
    body: {
      orderId: order.id,
      city: "one",
      deliveryMethod: "courier",
      courier_id: "courier-north",
      delivery_date: "2026-10-15",
      delivery_time: "13:00",
      status: "delivered",
      courierData: { address: "Ледяная 4", comment: "у подъезда", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  record("assign-courier", "Назначен выбранный курьер", order.courier_id === "courier-north" && order.status === "pending" && confirmed.data.status === "pending", order.courier_id);
  record("confirm-ignores-status", "Клиент не ставит delivered через confirm", order.status === "pending", order.status);
  record("deduct-once", "Confirm списывает один раз", workbook().products.find((item) => item.sku === "frost:10").stock === 5, `склад ${workbook().products.find((item) => item.sku === "frost:10").stock}`);
  const notice = db().notices.at(-1);
  record("notify-local", "Уведомление курьера записано локально", Boolean(notice) && notice.tgId === "100000001" && notice.text.includes(`#${order.display_number}`) && notice.text.includes("@customer_example") && notice.text.includes("ELFIN — Иней") && notice.text.includes("13:00") && notice.text.includes("17.8") && !notice.text.includes("Ледяная") && !notice.text.includes("Клиент"), notice ? notice.text.slice(0, 180) : "нет записи");
  record("notify-telegram", "Telegram не отправлялся", notice?.sent === false, "токена нет, реальная отправка не проверялась");

  const stockNow = workbook().products.find((item) => item.sku === "frost:10").stock;
  await call(port, "/api/order/confirm", {
    method: "POST",
    token: customer,
    body: {
      orderId: order.id,
      city: "one",
      deliveryMethod: "courier",
      courier_id: "courier-north",
      delivery_date: "2026-10-15",
      delivery_time: "13:00",
      courierData: { address: "Ледяная 4", comment: "у подъезда", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  record("deduct-repeat-confirm", "Повторный confirm не списывает снова", workbook().products.find((item) => item.sku === "frost:10").stock === stockNow, `склад ${workbook().products.find((item) => item.sku === "frost:10").stock}`);

  const switched = await call(port, "/api/order/confirm", {
    method: "POST",
    token: customer,
    body: {
      orderId: order.id,
      city: "one",
      deliveryMethod: "courier",
      courier_id: "courier-frost",
      delivery_date: "2026-10-15",
      delivery_time: "18:00",
      courierData: { address: "Другой адрес", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  record("customer-cannot-change-courier", "Покупатель не меняет courier_id после назначения", order.courier_id === "courier-north" && switched.status === 409, `стал ${order.courier_id}, ответ ${switched.status}`);

  await call(port, "/api/order/payment", {
    method: "POST",
    token: customer,
    body: { orderId: order.id, city: "one", paymentMethod: "cash", bonusApplied: 0, totalAmount: 1 },
  });
  record("payment-keeps-sum", "Оплата не подменяет сумму клиента", order.final_amount === 17.8, `final ${order.final_amount}`);

  const own = await call(port, "/api/courier/orders?city=one", { token: north });
  const other = await call(port, "/api/courier/orders?city=one&courierId=courier-north", { token: frost });
  const customerList = await call(port, "/api/courier/orders?city=one", { token: customer });
  record("courier-own", "Курьер видит только свой заказ", own.data.orders?.length === 1 && own.data.orders[0].orderId === order.id, `своих ${own.data.orders?.length}`);
  record("courier-foreign", "Чужой курьер и подмена courierId не открывают заказ", other.data.orders?.length === 0 && customerList.status === 403, `чужих ${other.data.orders?.length}, покупатель ${customerList.status}`);

  const customerDeliver = await call(port, "/api/courier/orders/status", {
    method: "POST",
    token: customer,
    body: { city: "one", orderId: order.id, status: "delivered" },
  });
  const customerAdmin = await call(port, "/api/admin/orders/status", {
    method: "POST",
    token: customer,
    body: { city: "one", orderId: order.id, status: "delivered", courier_id: "courier-frost" },
  });
  record("customer-cannot-deliver", "Покупатель не ставит delivered", customerDeliver.status === 403 && customerAdmin.status === 403 && order.status === "pending", `courier ${customerDeliver.status}, admin ${customerAdmin.status}, статус ${order.status}`);

  const moved = await call(port, "/api/admin/orders/status", {
    method: "POST",
    token: admin,
    body: { city: "one", orderId: order.id, status: "assigned", courier_id: "courier-frost" },
  });
  record("admin-keeps-courier", "Админ не переписывает courier_id", moved.data.courier_id === "courier-north" && order.courier_id === "courier-north", moved.data.courier_id);

  const issued = await call(port, "/api/courier/orders/status", {
    method: "POST",
    token: north,
    body: { city: "one", orderId: order.id, status: "delivered" },
  });
  const issuedAgain = await call(port, "/api/courier/orders/status", {
    method: "POST",
    token: north,
    body: { city: "one", orderId: order.id, status: "delivered" },
  });
  record("deliver", "«Выдал» ставит delivered и повтор не списывает", issued.data.status === "delivered" && issuedAgain.status === 400 && workbook().products.find((item) => item.sku === "frost:10").stock === 5, `повтор ${issuedAgain.status}, склад ${workbook().products.find((item) => item.sku === "frost:10").stock}`);

  const cancelOrder = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    body: { city: "one", items: [{ productId: "clear:10", quantity: 1, variant: "10 мл" }] },
  });
  await call(port, "/api/order/confirm", {
    method: "POST",
    token: customer,
    body: {
      orderId: cancelOrder.data.orderId,
      city: "one",
      deliveryMethod: "courier",
      courier_id: "courier-frost",
      delivery_date: "2026-10-15",
      delivery_time: "19:00",
      courierData: { address: "Южная 2", comment: "отмена", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  await call(port, "/api/order/payment", {
    method: "POST",
    token: customer,
    body: { orderId: cancelOrder.data.orderId, city: "one", paymentMethod: "cash", bonusApplied: 0 },
  });
  const clearStock = workbook().products.find((item) => item.sku === "clear:10").stock;
  const cancelled = await call(port, "/api/courier/orders/status", {
    method: "POST",
    token: frost,
    body: { city: "one", orderId: cancelOrder.data.orderId, status: "cancelled", reason: "Не дождался" },
  });
  const cancelledAgain = await call(port, "/api/courier/orders/status", {
    method: "POST",
    token: frost,
    body: { city: "one", orderId: cancelOrder.data.orderId, status: "cancelled", reason: "Ещё раз" },
  });
  const clearAfter = workbook().products.find((item) => item.sku === "clear:10").stock;
  record("cancel-status", "«Не выдал» ставит cancelled", cancelled.data.status === "cancelled" && db().orders[cancelOrder.data.orderId].cancel_reason === "Не дождался", cancelled.data.status);
  record("cancel-repeat", "Повторная отмена не возвращает остаток второй раз", cancelledAgain.status === 400 && clearAfter === clearStock + 1, `повтор ${cancelledAgain.status}, склад ${clearStock} → ${clearAfter}`);
  record("cancel-restock", "Отмена возвращает списанный остаток", clearAfter === clearStock + 1, `до отмены ${clearStock}, после ${clearAfter}`);

  const lastSku = "quiet:10";
  const lastBefore = workbook().products.find((item) => item.sku === lastSku).stock;
  const firstLast = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    headers: { "Idempotency-Key": "last-a" },
    body: { city: "one", items: [{ productId: lastSku, quantity: lastBefore, variant: "10 мл" }] },
  });
  const secondLast = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    headers: { "Idempotency-Key": "last-b" },
    body: { city: "one", items: [{ productId: lastSku, quantity: 1, variant: "10 мл" }] },
  });
  record("last-item", "Второй заказ не занимает уже зарезервированный остаток", firstLast.status === 200 && secondLast.status === 409 && workbook().products.find((item) => item.sku === lastSku).stock === lastBefore, `второй ${secondLast.status} ${secondLast.data.error || ""}, склад ${workbook().products.find((item) => item.sku === lastSku).stock}`);

  const raceSku = "sapphire:30";
  workbook().products.find((item) => item.sku === raceSku).stock = 1;
  const race = await Promise.all([
    call(port, "/api/order/create", { method: "POST", token: customer, headers: { "Idempotency-Key": "race-a" }, body: { city: "one", items: [{ productId: raceSku, quantity: 1 }] } }),
    call(port, "/api/order/create", { method: "POST", token: customer, headers: { "Idempotency-Key": "race-b" }, body: { city: "one", items: [{ productId: raceSku, quantity: 1 }] } }),
  ]);
  const raceOk = race.filter((item) => item.status === 200).length;
  record("last-item-parallel", "Два одновременных запроса не берут одну последнюю штуку оба", raceOk === 1 && workbook().products.find((item) => item.sku === raceSku).stock === 1, `успешных ${raceOk}, склад ${workbook().products.find((item) => item.sku === raceSku).stock}`);

  const broken = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    headers: { "Idempotency-Key": "broken" },
    body: { city: "one", items: [{ productId: "sapphire:10", quantity: 1, variant: "10 мл" }] },
  });
  const brokenStock = workbook().products.find((item) => item.sku === "sapphire:10").stock;
  record("break-after-create", "Обрыв до confirm не списывает склад", db().orders[broken.data.orderId].status === "buffer" && brokenStock === 5, `статус buffer, склад ${brokenStock}`);
  await call(port, "/api/order/confirm", {
    method: "POST",
    token: customer,
    body: {
      orderId: broken.data.orderId,
      city: "one",
      deliveryMethod: "pickup",
      courier_id: "courier-north",
      delivery_date: "2026-10-15",
      delivery_time: "14:00",
      courierData: { address: "иное", user: { tgId: "123456789", username: "customer_example" } },
    },
  });
  record("break-after-confirm", "Обрыв до оплаты оставляет одно списание и pending", db().orders[broken.data.orderId].status === "pending" && db().orders[broken.data.orderId].payment_method === "" && workbook().products.find((item) => item.sku === "sapphire:10").stock === 4 && db().orders[broken.data.orderId].delivery_address === "Северный вход", `склад ${workbook().products.find((item) => item.sku === "sapphire:10").stock}`);

  const expiring = await call(port, "/api/order/create", {
    method: "POST",
    token: customer,
    body: { city: "one", items: [{ productId: "north:30", quantity: 1, variant: "30 мл" }] },
  });
  const expiringStock = workbook().products.find((item) => item.sku === "north:30").stock;
  db().reservations.filter((item) => item.order_id === expiring.data.orderId).forEach((item) => {
    item.expiry_ms = Date.now() - 1000;
  });
  const expired = expireReservations();
  record("ttl-buffer", "Истёкший резерв отменяет buffer и не списывает склад", expired.includes(expiring.data.orderId) && db().orders[expiring.data.orderId].status === "cancelled" && workbook().products.find((item) => item.sku === "north:30").stock === expiringStock, `склад ${workbook().products.find((item) => item.sku === "north:30").stock}`);
  expireReservations();
  record("ttl-committed", "Повторная очистка не отменяет уже выданный заказ", db().orders[order.id].status === "delivered" && workbook().products.find((item) => item.sku === "frost:10").stock === 5, db().orders[order.id].status);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((item) => item.status === "fail");
console.log(`TOTAL ${results.length} FAIL ${failed.length}`);
process.exit(failed.length ? 1 : 0);

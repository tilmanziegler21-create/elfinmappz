import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

process.env.NODE_ENV = "test";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "elfin-fix-"));
process.env.JWT_SECRET = "test-secret";
process.env.ALLOW_DEV_AUTH = "1";
process.env.CITY_CODE = "one";
process.env.BONUS_CASHBACK_PERCENT = "10";
process.env.REFERRAL_REQUIRED = "2";
process.env.REFERRAL_BONUS_AMOUNT = "20";
delete process.env.STOCK_FAILPOINT;
delete process.env.TELEGRAM_BOT_TOKEN;

const { app, resumeStockMoves } = await import("./index.js");
const { db, workbook } = await import("./store.js");

const server = await new Promise((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const checks = [];

function record(id, name, ok, detail) {
  checks.push({ id, name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail || ""}`);
}

async function call(urlPath, { method = "GET", token, body } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function stock(sku) {
  return workbook().products.find((item) => item.sku === sku).stock;
}

function meeting(orderId, courierId, time, address, comment) {
  return {
    orderId,
    city: "one",
    deliveryMethod: "courier",
    courier_id: courierId,
    delivery_date: "2026-10-15",
    delivery_time: time,
    courierData: { address, comment, user: { tgId: "123456789", username: "customer_example" } },
  };
}

const customer = await call("/api/auth/dev", { method: "POST", body: { tgId: "123456789" } });
const north = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000001" } });
const frost = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000002" } });
const admin = await call("/api/auth/dev", { method: "POST", body: { tgId: "100000009" } });
const token = customer.data.token;

const before = stock("north:10");
const created = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
});
const orderId = created.data.orderId;
const first = await call("/api/order/confirm", { method: "POST", token, body: meeting(orderId, "courier-north", "13:00", "Ледяная 4", "у подъезда") });
const notices = db().notices.length;
const commits = db().stockMoves.filter((item) => item.id === `commit:${orderId}`).length;
record("A", "Первый confirm успешен", first.status === 200 && first.data.status === "pending" && db().orders[orderId].courier_id === "courier-north" && stock("north:10") === before - 1 && commits === 1, `статус ${first.status}, склад ${stock("north:10")}`);

const same = await call("/api/order/confirm", { method: "POST", token, body: meeting(orderId, "courier-north", "13:00", "Ледяная 4", "у подъезда") });
record("B", "Повтор с теми же данными идемпотентен", same.status === 200 && same.data.success === true && db().orders[orderId].courier_id === "courier-north" && stock("north:10") === before - 1 && db().notices.length === notices && db().stockMoves.filter((item) => item.order_id === orderId && item.type === "return").length === 0, `ответ ${same.status}, уведомлений ${db().notices.length}`);

const otherCourier = await call("/api/order/confirm", { method: "POST", token, body: meeting(orderId, "courier-frost", "18:00", "Ледяная 4", "у подъезда") });
record("C", "Другой курьер получает 409", otherCourier.status === 409 && db().orders[orderId].courier_id === "courier-north" && db().notices.length === notices, `ответ ${otherCourier.status}, курьер ${db().orders[orderId].courier_id}`);

const otherTime = await call("/api/order/confirm", { method: "POST", token, body: meeting(orderId, "courier-north", "14:00", "Другая 9", "другое") });
record("D", "Другое время, адрес и комментарий получают 409", otherTime.status === 409 && db().orders[orderId].delivery_time === "13:00" && db().orders[orderId].delivery_address === "Ледяная 4" && db().orders[orderId].comment === "у подъезда", `ответ ${otherTime.status}, время ${db().orders[orderId].delivery_time}`);

const raceCreated = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "frost:10", quantity: 1, variant: "10 мл" }] },
});
const raceId = raceCreated.data.orderId;
const frostBefore = stock("frost:10");
const [left, right] = await Promise.all([
  call("/api/order/confirm", { method: "POST", token, body: meeting(raceId, "courier-north", "12:00", "Первая 1", "один") }),
  call("/api/order/confirm", { method: "POST", token, body: meeting(raceId, "courier-frost", "19:00", "Вторая 2", "два") }),
]);
const codes = [left.status, right.status].sort((a, b) => a - b);
const winner = db().orders[raceId].courier_id;
record("E", "Два одновременных confirm: первый результат не переписан", codes[0] === 200 && codes[1] === 409 && (winner === "courier-north" || winner === "courier-frost") && stock("frost:10") === frostBefore - 1 && db().notices.filter((item) => item.order_id === raceId).length === 1, `ответы ${codes.join("/")}, курьер ${winner}, склад ${stock("frost:10")}/${frostBefore}, уведомления ${db().notices.filter((item) => item.order_id === raceId).length}`);

const sameRace = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "clear:10", quantity: 1, variant: "10 мл" }] },
});
const clearBefore = stock("clear:10");
const [one, two] = await Promise.all([
  call("/api/order/confirm", { method: "POST", token, body: meeting(sameRace.data.orderId, "courier-frost", "18:00", "Южная 2", "вместе") }),
  call("/api/order/confirm", { method: "POST", token, body: meeting(sameRace.data.orderId, "courier-frost", "18:00", "Южная 2", "вместе") }),
]);
record("E2", "Два одинаковых confirm не списывают дважды", one.status === 200 && two.status === 200 && stock("clear:10") === clearBefore - 1 && db().notices.filter((item) => item.order_id === sameRace.data.orderId).length === 1, `ответы ${one.status}/${two.status}, склад ${stock("clear:10")}/${clearBefore}, уведомления ${db().notices.filter((item) => item.order_id === sameRace.data.orderId).length}`);

const multi = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "sapphire:10", quantity: 2, variant: "10 мл" }, { productId: "sapphire:30", quantity: 1, variant: "30 мл" }] },
});
await call("/api/order/confirm", { method: "POST", token, body: meeting(multi.data.orderId, "courier-north", "15:00", "Складская 3", "возврат") });
await call("/api/order/payment", { method: "POST", token, body: { orderId: multi.data.orderId, city: "one", paymentMethod: "cash", bonusApplied: 0 } });
const sapphire10 = stock("sapphire:10");
const sapphire30 = stock("sapphire:30");
const returned = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId: multi.data.orderId, status: "cancelled", reason: "Не дождался" },
});
const returnMove = db().stockMoves.find((item) => item.id === `return:${multi.data.orderId}`);
record("F", "Отмена после списания возвращает каждый SKU", returned.data.status === "cancelled" && stock("sapphire:10") === sapphire10 + 2 && stock("sapphire:30") === sapphire30 + 1 && returnMove?.status === "done" && returnMove.lines.length === 2, `10 мл ${sapphire10}→${stock("sapphire:10")}, 30 мл ${sapphire30}→${stock("sapphire:30")}, проводка ${returnMove?.id}`);

const againCancel = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId: multi.data.orderId, status: "cancelled", reason: "Ещё раз" },
});
record("G", "Повторная отмена не добавляет остаток", againCancel.status === 400 && stock("sapphire:10") === sapphire10 + 2 && stock("sapphire:30") === sapphire30 + 1 && db().stockMoves.filter((item) => item.id === `return:${multi.data.orderId}`).length === 1, `ответ ${againCancel.status}`);

const parallelCancel = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "quiet:10", quantity: 1, variant: "10 мл" }] },
});
await call("/api/order/confirm", { method: "POST", token, body: meeting(parallelCancel.data.orderId, "courier-frost", "20:00", "Тихая 1", "гонка") });
const quietAfter = stock("quiet:10");
const [cancelA, cancelB] = await Promise.all([
  call("/api/courier/orders/status", { method: "POST", token: frost.data.token, body: { city: "one", orderId: parallelCancel.data.orderId, status: "cancelled", reason: "Первая" } }),
  call("/api/courier/orders/status", { method: "POST", token: frost.data.token, body: { city: "one", orderId: parallelCancel.data.orderId, status: "cancelled", reason: "Вторая" } }),
]);
const cancelCodes = [cancelA.status, cancelB.status].sort((a, b) => a - b);
record("H", "Две одновременные отмены возвращают остаток один раз", cancelCodes[0] === 200 && cancelCodes[1] === 400 && stock("quiet:10") === quietAfter + 1 && db().orders[parallelCancel.data.orderId].status === "cancelled", `ответы ${cancelCodes.join("/")}, склад ${stock("quiet:10")}`);

const reserved = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "north:30", quantity: 1, variant: "30 мл" }] },
});
const north30 = stock("north:30");
const held = db().reservations.filter((item) => item.order_id === reserved.data.orderId && item.released === false).reduce((sum, item) => sum + item.qty, 0);
const release = await call("/api/admin/orders/status", {
  method: "POST",
  token: admin.data.token,
  body: { city: "one", orderId: reserved.data.orderId, status: "cancelled" },
});
const stillHeld = db().reservations.filter((item) => item.order_id === reserved.data.orderId && item.released === false).reduce((sum, item) => sum + item.qty, 0);
const releaseMove = db().stockMoves.find((item) => item.id === `return:${reserved.data.orderId}`);
record("I", "Отмена до списания снимает резерв и не увеличивает остаток", held === 1 && release.data.status === "cancelled" && stock("north:30") === north30 && stillHeld === 0 && releaseMove?.type === "release", `резерв ${held}→${stillHeld}, склад ${stock("north:30")}`);

await call("/api/order/payment", { method: "POST", token, body: { orderId: orderId, city: "one", paymentMethod: "cash", bonusApplied: 0 } });
const delivered = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId, status: "delivered" },
});
const deliveredAgain = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId, status: "delivered" },
});
const cancelDelivered = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId, status: "cancelled", reason: "После выдачи" },
});
const adminDelivered = await call("/api/admin/orders/status", {
  method: "POST",
  token: admin.data.token,
  body: { city: "one", orderId, status: "cancelled" },
});
record("J", "Повторная выдача и обычная отмена delivered запрещены", delivered.data.status === "delivered" && deliveredAgain.status === 400 && cancelDelivered.status === 400 && adminDelivered.status === 409 && db().orders[orderId].status === "delivered" && stock("north:10") === before - 1, `выдача ${delivered.status}/${deliveredAgain.status}, отмена ${cancelDelivered.status}/${adminDelivered.status}`);

const crashOrder = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "sapphire:10", quantity: 1, variant: "10 мл" }] },
});
await call("/api/order/confirm", { method: "POST", token, body: meeting(crashOrder.data.orderId, "courier-frost", "21:00", "Обрыв 5", "сбой") });
const beforeCrash = stock("sapphire:10");
process.env.STOCK_FAILPOINT = "after-return";
const crashed = await call("/api/courier/orders/status", {
  method: "POST",
  token: frost.data.token,
  body: { city: "one", orderId: crashOrder.data.orderId, status: "cancelled", reason: "Обрыв" },
});
delete process.env.STOCK_FAILPOINT;
const midMove = db().stockMoves.find((item) => item.id === `return:${crashOrder.data.orderId}`);
record("K", "Сбой после возврата остатка и до статуса", crashed.status === 500 && stock("sapphire:10") === beforeCrash + 1 && db().orders[crashOrder.data.orderId].status !== "cancelled" && midMove?.status === "applied", `ответ ${crashed.status}, склад ${beforeCrash}→${stock("sapphire:10")}, статус ${db().orders[crashOrder.data.orderId].status}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const restarted = spawnSync(process.execPath, ["--input-type=module", "-e", `
process.env.NODE_ENV = "test";
process.env.DATA_DIR = ${JSON.stringify(process.env.DATA_DIR)};
process.env.JWT_SECRET = "test-secret";
process.env.ALLOW_DEV_AUTH = "1";
process.env.CITY_CODE = "one";
delete process.env.STOCK_FAILPOINT;
delete process.env.TELEGRAM_BOT_TOKEN;
const { resumeStockMoves } = await import(${JSON.stringify(path.join(here, "index.js"))});
const { db, workbook } = await import(${JSON.stringify(path.join(here, "store.js"))});
resumeStockMoves();
const order = db().orders[${JSON.stringify(crashOrder.data.orderId)}];
const sku = workbook().products.find((item) => item.sku === "sapphire:10");
const move = db().stockMoves.find((item) => item.id === ${JSON.stringify(`return:${crashOrder.data.orderId}`)});
console.log(JSON.stringify({ status: order.status, stock: sku.stock, move: move.status }));
`], { cwd: here, env: { ...process.env, STOCK_FAILPOINT: "", TELEGRAM_BOT_TOKEN: "" } });
const resumed = JSON.parse(String(restarted.stdout || "{}"));
record("L", "Перезапуск дописывает статус и не возвращает остаток второй раз", restarted.status === 0 && resumed.status === "cancelled" && resumed.stock === beforeCrash + 1 && resumed.move === "done", `код ${restarted.status}, ${restarted.stdout} ${restarted.stderr}`);

const balanceOrder = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
});
const balanceBefore = stock("north:10");
await call("/api/order/confirm", { method: "POST", token, body: meeting(balanceOrder.data.orderId, "courier-north", "16:00", "Баланс 6", "учёт") });
const balanceMid = stock("north:10");
await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId: balanceOrder.data.orderId, status: "cancelled", reason: "Баланс" },
});
record("M", "Баланс склада до confirm, после списания и после возврата", balanceMid === balanceBefore - 1 && stock("north:10") === balanceBefore, `${balanceBefore} → ${balanceMid} → ${stock("north:10")}`);

const buyer = db().users["123456789"];
const referrer = db().users["100000009"];
const courierUser = db().users["100000002"];
buyer.bonus_balance = 40;
buyer.referred_by = "100000009";
buyer.first_paid_order_at = "";
referrer.bonus_balance = 0;
referrer.referral_conversions = 1;
courierUser.bonus_balance = 0;
const bonusOrder = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "frost:10", quantity: 1, variant: "10 мл" }] },
});
await call("/api/order/confirm", { method: "POST", token, body: meeting(bonusOrder.data.orderId, "courier-frost", "22:00", "Бонус 7", "откат") });
const paid = await call("/api/order/payment", {
  method: "POST",
  token,
  body: { orderId: bonusOrder.data.orderId, city: "one", paymentMethod: "card", bonusApplied: 100 },
});
const afterPay = buyer.bonus_balance;
const afterReferral = referrer.bonus_balance;
const conversions = referrer.referral_conversions;
await call("/api/courier/orders/status", {
  method: "POST",
  token: frost.data.token,
  body: { city: "one", orderId: bonusOrder.data.orderId, status: "cancelled", reason: "Откат бонусов" },
});
record("bonus", "Отмена откатывает списанные бонусы, кэшбэк и реферальное начисление", paid.data.bonusApplied === 4.45 && paid.data.finalAmount === 4.45 && afterPay === 36 && afterReferral === 20 && conversions === 2 && buyer.bonus_balance === 40 && referrer.bonus_balance === 0 && referrer.referral_conversions === 1 && buyer.first_paid_order_at === "" && courierUser.bonus_balance === 0, `оплата бонус ${paid.data.bonusApplied}, баланс ${afterPay}→${buyer.bonus_balance}, реферер ${afterReferral}→${referrer.bonus_balance}`);

const chain = await call("/api/order/create", {
  method: "POST",
  token,
  body: { city: "one", items: [{ productId: "clear:10", quantity: 1, variant: "10 мл", price: 1 }], totalAmount: 1 },
});
const chainStock = stock("clear:10");
const chainConfirm = await call("/api/order/confirm", { method: "POST", token, body: meeting(chain.data.orderId, "courier-north", "17:00", "Цепочка 8", "как раньше") });
const chainPay = await call("/api/order/payment", { method: "POST", token, body: { orderId: chain.data.orderId, city: "one", paymentMethod: "cash", bonusApplied: 0, totalAmount: 1 } });
const own = await call("/api/courier/orders?city=one", { token: north.data.token });
const foreign = await call("/api/courier/orders?city=one&courierId=courier-north", { token: frost.data.token });
const chainDeliver = await call("/api/courier/orders/status", {
  method: "POST",
  token: north.data.token,
  body: { city: "one", orderId: chain.data.orderId, status: "delivered" },
});
record("N", "Рабочая цепочка без регрессии", chain.data.totalAmount === 8.5 && chainConfirm.data.status === "pending" && stock("clear:10") === chainStock - 1 && chainPay.data.finalAmount === 8.5 && own.data.orders.some((item) => item.orderId === chain.data.orderId) && !foreign.data.orders.some((item) => item.orderId === chain.data.orderId) && chainDeliver.data.status === "delivered" && stock("clear:10") === chainStock - 1, `сумма ${chain.data.totalAmount}, склад ${chainStock}→${stock("clear:10")}`);

resumeStockMoves();
record("L2", "Повторное восстановление в том же процессе не возвращает остаток второй раз", stock("sapphire:10") === beforeCrash + 1 && db().orders[crashOrder.data.orderId].status === "cancelled", `склад ${stock("sapphire:10")}, статус ${db().orders[crashOrder.data.orderId].status}`);

server.close();
const failed = checks.filter((item) => !item.ok);
console.log(`TOTAL ${checks.length} FAIL ${failed.length}`);
if (failed.length) process.exit(1);

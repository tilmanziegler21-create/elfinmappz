import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import { priceOrder } from "./pricing.js";
import {
  activeReservations,
  addReservation,
  adjustStock,
  blankOrderRow,
  db,
  expireReservations,
  hydrateStore,
  persist,
  ensureRuntimeState,
  fieldKind,
  releaseReservations,
  reservationCleanup,
  upsertOrderRow,
  whenPersisted,
  withOrderLock,
  workbook,
} from "./store.js";
import { readHamburgSources } from "./hhRead.js";
import { hhTabReport, listSheetTitles, loadServiceAccount, sheetCode, sheetTabs, spreadsheetMeta } from "./sheetsRead.js";
import { withMedia } from "./productMedia.js";
import { bindNoticeRecipient, enqueueNotice, telegramTestMode, trySendNotice } from "./notices.js";
import { httpsUrl, onceUpdate } from "./bot.js";
import { language } from "./botCopy.js";
import { configureBot, dispatchUpdate, runPolling, telegramProbeState } from "./botPoll.js";
import { courierSlots } from "./slots.js";

const PORT = Number(process.env.PORT || 8787);
const CITY = String(process.env.CITY_CODE || "HH").trim();
const CITY_NAME = String(process.env.CITY_NAME || "Hamburg").trim();
const BLOCKED_CITIES = new Set(["FFM", "HG", "MU"]);
const ALLOWED = new Set(String(process.env.CITY_CODES || CITY).split(",").map((item) => item.trim()).filter(Boolean));
if (process.env.NODE_ENV !== "test" && BLOCKED_CITIES.has(CITY)) {
  throw new Error("CITY_CODE must be HH");
}
const JWT_SECRET = String(process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "elfin-dev-secret"));
const DEV_AUTH = process.env.ALLOW_DEV_AUTH !== "0" && process.env.NODE_ENV !== "production";
const RESERVATION_TTL_MS = Number(process.env.RESERVATION_TTL_MS || 30 * 60 * 1000);
const CASHBACK_PERCENT = Number(process.env.BONUS_CASHBACK_PERCENT || 10);
const PAYOUT_PERCENT = Number(process.env.COURIER_PAYOUT_PERCENT || 20);
const REFERRAL_REQUIRED = Number(process.env.REFERRAL_REQUIRED || 2);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS_AMOUNT || 20);

const app = express();
app.use(express.json());

function allowedOrigins() {
  const origins = new Set();
  for (const name of ["MINIAPP_PUBLIC_URL", "FRONTEND_ORIGIN"]) {
    const raw = String(process.env[name] || "").trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) origins.add(url.origin);
    } catch {
      continue;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:5173");
  }
  return origins;
}

app.set("trust proxy", 1);
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, idempotency-key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const rateBuckets = new Map();
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "test" || req.path === "/api/telegram/webhook") return next();
  const key = req.ip || "local";
  const now = Date.now();
  const row = (rateBuckets.get(key) || []).filter((time) => now - time < 60_000);
  if (row.length >= 300) return res.status(429).json({ error: "RATE_LIMIT" });
  row.push(now);
  rateBuckets.set(key, row);
  next();
});

function cityOf(value) {
  const city = String(value || "").trim();
  if (!city || BLOCKED_CITIES.has(city) || !ALLOWED.has(city)) return null;
  return city;
}

function useLocalCatalog() {
  if (process.env.DEMO_CATALOG === "1") return true;
  return process.env.NODE_ENV === "test" && process.env.SHEETS_CATALOG !== "1";
}

async function shopCatalog() {
  if (useLocalCatalog()) return { products: workbook().products, couriers: workbook().couriers };
  try {
    return await readHamburgSources();
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    return { products: workbook().products, couriers: workbook().couriers };
  }
}

function localProducts() {
  return workbook().products.map((item) => {
    const reserved = activeReservations(item.sku).reduce((sum, row) => sum + row.qty, 0);
    return { ...item, available: Math.max(0, Number(item.stock) - reserved) };
  });
}

function sheetsFailure(error) {
  const code = ["SHEETS_NOT_CONFIGURED", "SHEETS_AUTH_INCOMPLETE", "SHEETS_AUTH_INVALID", "SHEETS_HH_MISSING", "SHEETS_TIMEOUT", "SHEETS_INVALID", "SHEETS_FAILED"].includes(error.code)
    ? error.code
    : "SHEETS_FAILED";
  return { status: code === "SHEETS_TIMEOUT" ? 504 : error.status || 503, body: { error: code, source: "unavailable" } };
}

function signUser(user) {
  if (!JWT_SECRET) {
    const error = new Error("JWT secret is not configured");
    error.status = 500;
    throw error;
  }
  return jwt.sign({ tgId: user.tg_id }, JWT_SECRET, { expiresIn: "12h" });
}

function publicUser(user) {
  return {
    tgId: String(user.tg_id),
    username: user.username || "",
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    status: user.status || "user",
  };
}

const lastOrderTrace = { stage: "pending", code: "" };

function requestIdOf(req) {
  const raw = String(req.get("x-request-id") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  return raw || `srv-${Date.now().toString(36)}`;
}

function orderTrace(requestId, stage, code) {
  const safeStage = String(stage || "").replace(/[^A-Z_]/g, "").slice(0, 40) || "UNKNOWN";
  const safeCode = String(code || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "UNKNOWN";
  lastOrderTrace.stage = safeStage;
  lastOrderTrace.code = safeCode;
  console.log(`ORDER requestId=${requestId} stage=${safeStage} code=${safeCode}`);
}

function logAuth(req, code) {
  if (req.orderTraceId) orderTrace(req.orderTraceId, "AUTH_VALIDATED", code);
}

function mark(req, stage, code) {
  if (req.orderTraceId) orderTrace(req.orderTraceId, stage, code);
}

function priceFailureCode(error) {
  const code = String(error || "");
  if (code === "PRICE_RULES_AMBIGUOUS" || code === "INVALID_PROMO") return code;
  return "PRICE_REJECTED";
}

function beginOrderTrace(req, _res, next) {
  req.orderTraceId = requestIdOf(req);
  const bearer = String(req.headers.authorization || "").startsWith("Bearer ");
  orderTrace(req.orderTraceId, "CHECKOUT_SUBMIT", bearer ? "bearer" : "no_bearer");
  next();
}

function authFailureCode(error) {
  const known = {
    "Bot token not configured": "BOT_TOKEN_MISSING",
    "No hash in initData": "NO_HASH",
    "Invalid hash": "INVALID_HASH",
    "Expired initData": "EXPIRED_INITDATA",
    "No user in initData": "NO_USER",
  };
  return known[String(error?.message || "")] || "AUTH_FAILED";
}

function noticeResultCode(notice) {
  if (notice?.sent) return "SENT";
  const code = String(notice?.last_error || "");
  return /^[A-Z0-9_]{1,40}$/.test(code) ? code : "NOT_SENT";
}

function requireAuth(req, res, next) {
  if (!JWT_SECRET) {
    logAuth(req, "JWT_SECRET_MISSING");
    return res.status(500).json({ error: "JWT secret is not configured" });
  }
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    logAuth(req, "NO_BEARER");
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db().users[String(payload.tgId)];
    if (!user) {
      logAuth(req, "USER_NOT_FOUND");
      return res.status(401).json({ error: "User not found" });
    }
    req.user = user;
    logAuth(req, "ok");
    next();
  } catch {
    logAuth(req, "INVALID_TOKEN");
    return res.status(401).json({ error: "Invalid token" });
  }
}

function verifyInitData(initData) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "");
  if (!botToken) {
    const error = new Error("Bot token not configured");
    error.status = 500;
    throw error;
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    const error = new Error("No hash in initData");
    error.status = 401;
    throw error;
  }
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(calculated, "hex");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    const error = new Error("Invalid hash");
    error.status = 401;
    throw error;
  }
  const authDate = Number(params.get("auth_date"));
  const age = Date.now() / 1000 - authDate;
  if (!Number.isFinite(authDate) || authDate <= 0 || age > 24 * 60 * 60 || age < -300) {
    const error = new Error("Expired initData");
    error.status = 401;
    throw error;
  }
  const raw = params.get("user");
  if (!raw) {
    const error = new Error("No user in initData");
    error.status = 401;
    throw error;
  }
  const id = String(raw).match(/"id"\s*:\s*(\d+)/)?.[1] || "";
  if (!id) {
    const error = new Error("No user in initData");
    error.status = 401;
    throw error;
  }
  const user = JSON.parse(raw);
  user.id = id;
  return user;
}

function publicUsername(value) {
  const name = String(value || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(name) || !/[A-Za-z_]/.test(name)) return "";
  return name;
}

function botUsername() {
  return publicUsername(process.env.TELEGRAM_BOT_USERNAME) || publicUsername(telegramProbeState().username) || null;
}

function writeCourierFor(courier, orderId) {
  const account = courier?.tg_id ? db().users[String(courier.tg_id)] : null;
  const username = publicUsername(account?.username);
  const id = String(orderId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const target = {};
  if (username) target.url = `https://t.me/${username}`;
  if (id) target.start = `ord_${id}`;
  return target;
}

function syncRole(user) {
  const admins = new Set(String(process.env.ADMIN_TG_IDS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (admins.has(user.tg_id)) user.status = "admin";
  if (user.status === "admin") return user;
  const courier = workbook().couriers.find((item) => item.tg_id === user.tg_id && item.active);
  if (courier) user.status = "courier";
  return user;
}

function ensureUser(tgId, username, firstName, lastName = "") {
  const id = String(tgId);
  if (!db().users[id]) {
    db().users[id] = {
      tg_id: id,
      username: username || "",
      first_name: firstName || "",
      last_name: lastName || "",
      status: "user",
      bonus_balance: 0,
      level_percent: 0,
      deferred_discount: 0,
      referred_by: "",
      referral_conversions: 0,
      first_paid_order_at: "",
      created_at: new Date().toISOString(),
    };
  }
  const user = db().users[id];
  if (firstName) user.first_name = firstName;
  if (lastName) user.last_name = lastName;
  user.username = username || "";
  return syncRole(user);
}

function normalizeStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "buffer";
  if (value === "paid" || value === "confirmed") return "pending";
  if (value === "courier_assigned") return "assigned";
  return value;
}

function courierById(id) {
  return workbook().couriers.find((item) => item.courier_id === id || item.tg_id === id) || null;
}

async function courierForUser(user) {
  const tg = String(user?.tg_id || "");
  if (!tg) return null;
  if (!useLocalCatalog()) {
    try {
      const data = await readHamburgSources();
      return (data.couriers || []).find((item) => String(item.tg_id) === tg && item.active) || null;
    } catch {
      /* The saved snapshot remains the fallback when the sheet cannot be read. */
    }
  }
  return workbook().couriers.find((item) => item.tg_id === tg && item.active) || null;
}

function slots(courier) {
  return courierSlots(courier);
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `${digits.slice(0, 2)}•••${digits.slice(-2)}`;
}

function orderItems(orderId) {
  return db().items.filter((item) => item.order_id === orderId);
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function customerOrder(order) {
  return {
    orderId: order.id,
    status: normalizeStatus(order.status),
    totalAmount: order.total_amount,
    finalAmount: order.final_amount ?? null,
    deliveryMethod: order.delivery_method || "",
    time: order.delivery_time || "",
    date: order.delivery_date || "",
    place: order.delivery_address || "",
    comment: order.comment || "",
    courierId: order.courier_id || "",
    writeCourier: writeCourierFor(courierById(order.courier_id), order.id),
    lines: orderItems(order.id).map((item) => ({
      name: item.name,
      variant: item.variant,
      qty: item.quantity,
    })),
    units: orderItems(order.id).reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

function courierOrder(order) {
  const amount = order.final_amount != null && order.final_amount !== "" ? Number(order.final_amount) : Number(order.total_amount);
  const courier = courierById(order.courier_id);
  return {
    ...customerOrder(order),
    customerName: order.user_name || "",
    username: order.username || "",
    tgId: order.user_id,
    phone: maskPhone(order.user_phone),
    payout: money(amount * PAYOUT_PERCENT / 100),
    courierName: courier?.name || "",
  };
}

function tgPresence(value) {
  const tg = String(value || "").trim();
  if (!tg) return "missing";
  if (!/^\d+$/.test(tg)) return "not_numeric";
  return "present";
}

function telegramFailureCode(status, description) {
  const text = String(description || "").toLowerCase();
  if (text.includes("bot was blocked")) return "BOT_BLOCKED";
  if (text.includes("chat not found")) return "CHAT_NOT_FOUND";
  if (text.includes("can't initiate") || text.includes("cant initiate")) return "CHAT_NOT_STARTED";
  const http = Number(status || 0);
  if (http) return `HTTP_${http}`;
  return "TELEGRAM_REJECTED";
}

async function notifyCourier(order, courier = courierById(order.courier_id), requestId) {
  const presence = tgPresence(courier?.tg_id);
  if (requestId) {
    orderTrace(requestId, "COURIER_RESOLVED", courier?.courier_id ? "ok" : "missing");
    orderTrace(requestId, "COURIER_TG_ID_PRESENT", presence);
  }
  const html = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = orderItems(order.id).map((item) => `• ${html(item.name)}${item.variant ? ` · ${html(item.variant)}` : ""} × ${html(item.quantity)}`);
  const statusLabel = { pending: "Ожидает подтверждения", assigned: "Назначен", picked_up: "В пути", delivered: "Выдан", cancelled: "Отменён" }[normalizeStatus(order.status)] || "Ожидает подтверждения";
  const text = [
    `📦 <b>Заказ ${html(order.id)}</b>`,
    `📅 ${html(order.delivery_date || "—")}`,
    `⏰ ${html(order.delivery_time || "—")}`,
    `📌 ${html(statusLabel)}`,
    `💳 ${order.payment_method === "card" ? "Карта" : "Наличные"}`,
    lines.join("\n"),
    `💰 По заказу: ${html(order.total_amount)} €`,
  ].filter(Boolean).join("\n");
  const orderKey = /^[A-Za-z0-9_-]{1,40}$/.test(String(order.id || "")) ? String(order.id) : "";
  const notice = enqueueNotice({
    recipient: presence === "present" ? String(courier.tg_id).trim() : "",
    text,
    orderId: order.id,
    kind: "courier",
  });
  await trySendNotice(notice, async (item) => {
    if (requestId) orderTrace(requestId, "NOTIFICATION_ATTEMPTED", "ok");
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "");
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: item.recipient,
        text: item.text,
        parse_mode: "HTML",
        reply_markup: orderKey ? { inline_keyboard: [[{ text: "Открыть заказ", callback_data: `c:od:${orderKey}` }]] } : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    const description = response.ok ? "" : String(data?.description || "");
    const code = response.ok ? "" : telegramFailureCode(response.status, description);
    notice.http_status = response.status;
    if (requestId) {
      orderTrace(requestId, "TELEGRAM_HTTP_STATUS", String(response.status));
      orderTrace(requestId, "TELEGRAM_ERROR_CODE", response.ok ? "ok" : code);
      orderTrace(requestId, "NOTIFICATION_SENT", response.ok ? "ok" : "fail");
    }
    return { ok: response.ok, code, messageId: data?.result?.message_id };
  });
  if (requestId && !notice.sent && notice.last_error !== "TELEGRAM_REJECTED" && !notice.http_status) {
    orderTrace(requestId, "NOTIFICATION_ATTEMPTED", "skipped");
    orderTrace(requestId, "TELEGRAM_HTTP_STATUS", "skipped");
    orderTrace(requestId, "TELEGRAM_ERROR_CODE", notice.last_error === "NO_RECIPIENT" && presence !== "present" ? (presence === "not_numeric" ? "COURIER_TELEGRAM_ID_NOT_NUMERIC" : "COURIER_TELEGRAM_ID_MISSING") : (notice.last_error || "NOT_SENT"));
    orderTrace(requestId, "NOTIFICATION_SENT", "fail");
  }
  return notice;
}

function linesOf(orderId) {
  return orderItems(orderId).map((item) => ({ sku: item.productId, qty: Number(item.quantity) }));
}

function sameMeeting(order, next) {
  return order.delivery_method === next.method
    && order.courier_id === next.courier
    && String(order.delivery_date || "") === next.date
    && String(order.delivery_time || "") === next.time
    && String(order.delivery_address || "") === next.place
    && String(order.comment || "") === next.comment;
}

function commitStock(order) {
  if (order.stock_committed) return;
  const id = `commit:${order.id}`;
  let move = db().stockMoves.find((item) => item.id === id);
  if (!move) {
    move = { id, order_id: order.id, type: "commit", lines: linesOf(order.id), status: "pending" };
    db().stockMoves.push(move);
    persist();
  }
  if (move.status !== "pending") return;
  const localLines = move.lines.filter((line) => workbook().products.some((row) => row.sku === line.sku));
  if (localLines.length === 0) {
    move.status = "applied";
    order.stock_committed = true;
    releaseReservations(order.id);
    persist();
    return;
  }
  move.lines = localLines;
  adjustStock(move.lines, -1);
  move.status = "applied";
  order.stock_committed = true;
  releaseReservations(order.id);
  persist();
}

function reverseBonuses(order) {
  if (order.bonus_reversed) return;
  const user = db().users[String(order.user_id)];
  if (user) {
    const spend = Number(order.bonus_applied || 0);
    const earn = Number(order.cashback_earned || 0);
    user.bonus_balance = money(Number(user.bonus_balance || 0) + spend - earn);
  }
  const referral = order.referral_bonus;
  if (referral?.tgId) {
    const referrer = db().users[String(referral.tgId)];
    if (referrer) {
      referrer.bonus_balance = money(Number(referrer.bonus_balance || 0) - Number(referral.amount || 0));
      referrer.referral_conversions = Math.max(0, Number(referrer.referral_conversions || 0) - Number(referral.conversions || 0));
    }
    if (referral.first && user) user.first_paid_order_at = "";
  }
  order.bonus_reversed = true;
}

function returnStock(order, reason) {
  const current = normalizeStatus(order.status);
  if (current === "delivered") {
    const error = new Error("Заказ уже выдан");
    error.status = 409;
    throw error;
  }
  if (current === "cancelled") {
    const error = new Error("Invalid status");
    error.status = 400;
    throw error;
  }
  const id = `return:${order.id}`;
  let move = db().stockMoves.find((item) => item.id === id);
  if (!move) {
    move = {
      id,
      order_id: order.id,
      type: order.stock_committed ? "return" : "release",
      lines: linesOf(order.id),
      status: "pending",
    };
    db().stockMoves.push(move);
    persist();
  }
  if (move.status === "pending") {
    if (move.type === "return") {
      adjustStock(move.lines, 1);
      order.stock_returned = true;
    } else releaseReservations(order.id);
    move.status = "applied";
    persist();
    if (process.env.STOCK_FAILPOINT === "after-return") {
      const error = new Error("STOCK_FAILPOINT");
      error.status = 500;
      throw error;
    }
  }
  reverseBonuses(order);
  order.status = "cancelled";
  order.cancel_reason = reason || order.cancel_reason || "";
  order.cancelled_at = order.cancelled_at || new Date().toISOString();
  move.status = "done";
  upsertOrderRow({
    order_id: order.id,
    status: "cancelled",
    cancelled_at: order.cancelled_at,
    cancel_reason: order.cancel_reason,
    stock_committed: order.stock_committed ? "TRUE" : "FALSE",
  });
}

function resumeStockMoves() {
  for (const move of db().stockMoves) {
    const order = db().orders[move.order_id];
    if (!order) continue;
    if (move.status === "pending" && move.type === "commit") commitStock(order);
    if (move.status === "pending" && move.type === "return") {
      adjustStock(move.lines, 1);
      order.stock_returned = true;
      move.status = "applied";
      persist();
    }
    if (move.status === "pending" && move.type === "release") {
      releaseReservations(order.id);
      move.status = "applied";
      persist();
    }
    const open = normalizeStatus(order.status);
    if (move.type !== "commit" && move.status === "applied" && open !== "cancelled" && open !== "delivered") {
      reverseBonuses(order);
      order.status = "cancelled";
      order.cancelled_at = order.cancelled_at || new Date().toISOString();
      order.cancel_reason = order.cancel_reason || "Возврат склада";
      upsertOrderRow({
        order_id: order.id,
        status: "cancelled",
        cancelled_at: order.cancelled_at,
        cancel_reason: order.cancel_reason,
      });
      move.status = "done";
      persist();
    }
  }
}

async function recordCourierNotice(requestId, order, courier) {
  const notice = await notifyCourier(order, courier, requestId);
  if (requestId) orderTrace(requestId, "COURIER_NOTIFICATION_RESULT", noticeResultCode(notice));
  return notice;
}

function confirmPayload(order, courier) {
  return {
    success: true,
    status: normalizeStatus(order.status),
    telegram: Boolean(order.telegram_sent),
    orderId: order.id,
    courierName: courier?.name || "",
    writeCourier: writeCourierFor(courier, order.id),
  };
}

async function applyConfirm(order, next, data, courier, requestId) {
  if (order.delivery_locked) {
    if (!sameMeeting(order, next)) return { status: 409, payload: { error: "CONFIRM_CONFLICT" } };
    if (!order.telegram_sent) {
      const notice = await recordCourierNotice(requestId, order, courier);
      order.telegram_sent = Boolean(notice?.sent);
    }
    persist();
    return { status: 200, payload: confirmPayload(order, courier) };
  }
  const current = normalizeStatus(order.status);
  if (current === "cancelled" || current === "delivered") return { status: 409, payload: { error: "CONFIRM_CONFLICT" } };
  commitStock(order);
  if (current === "buffer") order.status = "pending";
  order.delivery_method = next.method;
  order.courier_id = next.courier;
  order.delivery_date = next.date;
  order.delivery_time = next.time;
  order.delivery_address = next.place;
  order.comment = next.comment;
  const givenName = String(data.user?.name || "").trim();
  order.user_name = givenName || String(data.user?.username || order.user_name || "");
  order.delivery_locked = true;
  upsertOrderRow({
    order_id: order.id,
    status: order.status,
    courier_id: next.courier,
    delivery_date: next.date,
    delivery_time: next.time,
    delivery_method: next.method,
    delivery_address: next.place,
    comment: next.comment,
    user_name: order.user_name,
    stock_committed: "TRUE",
    item_count: String(orderItems(order.id).length),
    items_json: JSON.stringify(orderItems(order.id)),
  });
  if (!order.courier_notified_at || !order.telegram_sent) {
    order.courier_notified_at = order.courier_notified_at || new Date().toISOString();
    const notice = await recordCourierNotice(requestId, order, courier);
    order.telegram_sent = Boolean(notice?.sent);
  }
  return { status: 200, payload: confirmPayload(order, courier) };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    city: CITY,
    cityName: CITY_NAME,
    catalog: useLocalCatalog() ? "demo" : "sheets",
    sheetCode: sheetCode(),
    warehouseConfirmed: false,
    writes: false,
  });
});

let sheetsReadyCache = { at: 0, value: "unavailable" };

async function sheetsReady() {
  if (Date.now() - sheetsReadyCache.at < 60_000) return sheetsReadyCache.value;
  try {
    const titles = await Promise.race([
      listSheetTitles(),
      new Promise((_, reject) => {
        const error = new Error("SHEETS_TIMEOUT");
        error.code = "SHEETS_TIMEOUT";
        setTimeout(() => reject(error), 4000);
      }),
    ]);
    const report = hhTabReport(titles);
    sheetsReadyCache = { at: Date.now(), value: report.ready ? "ready" : "missing" };
  } catch (error) {
    sheetsReadyCache = { at: Date.now(), value: error.code === "SHEETS_HH_MISSING" ? "missing" : "unavailable" };
  }
  return sheetsReadyCache.value;
}

function storageMode() {
  if (String(process.env.DATABASE_URL || "").trim()) return "persistent";
  const mount = String(process.env.RENDER_DISK_MOUNT || "").trim();
  const dir = String(process.env.DATA_DIR || "").trim();
  if (mount && dir.startsWith(mount)) return "persistent";
  return "ephemeral";
}

function acceptState(res, requestId) {
  try {
    ensureRuntimeState();
    return true;
  } catch (error) {
    const code = String(error.code || "STATE_MIGRATION_STOPPED").replace(/[^A-Z0-9_]/g, "") || "STATE_MIGRATION_STOPPED";
    if (requestId) orderTrace(requestId, "ORDER_VALIDATED", code);
    res.status(500).json({ error: error.code || "STATE_MIGRATION_STOPPED" });
    return false;
  }
}

function refuseEphemeralOrders(req, res, next) {
  if (process.env.NODE_ENV === "production" && storageMode() !== "persistent") {
    if (req.orderTraceId) orderTrace(req.orderTraceId, "ORDER_VALIDATED", "ORDERS_NEED_DATABASE");
    res.status(503).json({ error: "ORDERS_NEED_DATABASE" });
    return;
  }
  next();
}

function latestCheckoutFact(couriers = []) {
  const orders = Object.values(db().orders || {}).filter((item) => item && item.id);
  const latest = orders.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  const openOrders = orders
    .filter((order) => ["pending", "assigned", "picked_up"].includes(normalizeStatus(order.status)))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 8)
    .map((order) => orderNoticeFact(order, couriers));
  if (!latest) return { orderId: "", orderStatus: "", courierId: "", orderNotice: "none", orderHttp: 0, orderCount: 0, recipientAllowed: "no_recipient", messageId: 0, openOrders };
  const fact = orderNoticeFact(latest, couriers);
  return { ...fact, orderCount: orders.length, openOrders };
}

function orderNoticeFact(order, couriers) {
  const courier = couriers.find((item) => item.courier_id === order.courier_id);
  const notice = (db().notices || []).find((item) => item.order_id === order.id && (item.kind === "courier" || String(item.id || "").startsWith("courier:")));
  const messageId = Number(notice?.telegram_message_id);
  const tg = String(courier?.tg_id || "").trim();
  return {
    orderId: String(order.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
    orderStatus: String(order.status || "").replace(/[^a-z_]/g, "").slice(0, 20),
    courierId: String(order.courier_id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
    courierTg: courier ? tgPresence(courier.tg_id) : "absent",
    recipientAllowed: !/^\d+$/.test(tg) ? "no_recipient" : (telegramTestMode() ? (new Set(String(process.env.TELEGRAM_TEST_IDS || "").split(",").map((item) => item.trim()).filter(Boolean)).has(tg) ? "yes" : "no") : "yes"),
    orderNotice: notice ? noticeResultCode(notice) : "none",
    orderHttp: Number(notice?.http_status || 0),
    messageId: Number.isInteger(messageId) && messageId > 0 ? messageId : 0,
  };
}

let courierTgCache = { at: 0, value: { "C-001": "unread", "C-002": "unread" } };

async function courierRowsForReady() {
  if (useLocalCatalog()) return workbook().couriers;
  try {
    const data = await readHamburgSources();
    return data.couriers || [];
  } catch {
    return workbook().couriers;
  }
}

async function courierTgPresence() {
  if (Date.now() - courierTgCache.at < 60_000) return courierTgCache.value;
  try {
    const data = await readHamburgSources();
    const value = {};
    for (const id of ["C-001", "C-002"]) {
      const row = (data.couriers || []).find((item) => item.courier_id === id);
      value[id] = row ? tgPresence(row.tg_id) : "absent";
    }
    courierTgCache = { at: Date.now(), value };
    return value;
  } catch {
    return courierTgCache.value;
  }
}

app.get("/api/ready", async (_req, res) => {
  const telegram = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET ? "configured" : "not configured";
  const probe = telegramProbeState();
  const courierRows = await courierRowsForReady();
  const checkout = latestCheckoutFact(courierRows);
  const couriers = await courierTgPresence();
  const testIds = String(process.env.TELEGRAM_TEST_IDS || "").split(",").map((item) => item.trim()).filter(Boolean);
  res.json({
    api: "ready",
    telegram,
    telegramGetMe: probe.getMe,
    telegramBot: probe.username || "",
    telegramWebhook: probe.webhook,
    telegramPending: probe.pendingUpdates,
    telegramLastError: probe.lastError,
    orderStage: lastOrderTrace.stage,
    orderCode: lastOrderTrace.code,
    orderId: checkout.orderId,
    orderStatus: checkout.orderStatus,
    courierId: checkout.courierId,
    orderNotice: checkout.orderNotice,
    orderHttp: checkout.orderHttp,
    orderCount: checkout.orderCount,
    courierTgC001: couriers["C-001"],
    courierTgC002: couriers["C-002"],
    testMode: telegramTestMode() ? "on" : "off",
    testModeEffective: telegramTestMode() ? "on" : "off",
    testModeValue: ["", "0", "1", "false", "true", "off", "on", "no", "yes"].includes(String(process.env.TELEGRAM_TEST_MODE ?? "").trim().toLowerCase()) ? (String(process.env.TELEGRAM_TEST_MODE ?? "").trim().toLowerCase() || "empty") : "other",
    allowedRecipientCount: testIds.length,
    recipientAllowed: checkout.recipientAllowed,
    messageId: checkout.messageId,
    openOrders: checkout.openOrders,
    testIds: testIds.length ? "set" : "empty",
    sheets: await sheetsReady(),
    database: storageMode(),
    stateSchema: Number(db().schemaVersion || 0),
    users: fieldKind("users"),
    reservations: fieldKind("reservations"),
    orders: fieldKind("orders"),
    orderIdempotency: fieldKind("orderIdempotency"),
    reservationCleanup: reservationCleanup(),
    writes: false,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    city: CITY,
    cityName: CITY_NAME,
    devAuth: DEV_AUTH,
    catalog: useLocalCatalog() ? "demo" : "sheets",
    sheetCode: sheetCode(),
    warehouseConfirmed: false,
    loyalty: process.env.ENABLE_LOYALTY === "1",
    priceMatch: process.env.ENABLE_PRICE_MATCH === "1",
    liveOrders: process.env.ENABLE_LIVE_ORDERS === "1",
    sheetsWrites: process.env.SHEETS_READ_ONLY === "0",
    payments: ["cash"],
    botUsername: botUsername(),
  });
});

app.post("/api/auth/dev", (req, res) => {
  if (!DEV_AUTH) return res.status(404).json({ error: "Not found" });
  const user = db().users[String(req.body?.tgId || "")];
  if (!user) return res.status(404).json({ error: "User not found" });
  persist();
  res.json({ token: signUser(user), user: publicUser(user), dev: true, city: CITY });
});

app.post("/api/auth/telegram", (req, res) => {
  const requestId = requestIdOf(req);
  try {
    const telegramUser = verifyInitData(String(req.body?.initData || ""));
    const user = ensureUser(telegramUser.id, telegramUser.username, telegramUser.first_name, telegramUser.last_name);
    persist();
    orderTrace(requestId, "AUTH_VALIDATED", "ok");
    res.json({ token: signUser(user), user: publicUser(user), dev: false, city: CITY });
  } catch (error) {
    orderTrace(requestId, "AUTH_VALIDATED", authFailureCode(error));
    res.status(error.status || 401).json({ error: error.message || "Authentication failed" });
  }
});

app.post("/api/order/trace", (req, res) => {
  const stage = String(req.body?.stage || "");
  const code = String(req.body?.code || "");
  const stages = new Set(["CHECKOUT_SUBMIT"]);
  const codes = new Set(["NO_BEARER", "AUTH_PHASE", "NO_COURIER", "NO_SLOT", "NO_ADDRESS", "PAYMENT_UNAVAILABLE", "SERVER_UNREACHABLE"]);
  if (!stages.has(stage) || !codes.has(code)) return res.status(400).json({ error: "Invalid trace" });
  orderTrace(requestIdOf(req), stage, code);
  res.json({ ok: true });
});

app.get("/api/catalog", async (req, res) => {
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  if (useLocalCatalog()) return res.json({ source: "demo", city, products: localProducts() });
  try {
    const data = await readHamburgSources();
    res.json({ source: "sheets", city: "HH", products: data.products.map(withMedia) });
  } catch (error) {
    const failure = sheetsFailure(error);
    res.status(failure.status).json(failure.body);
  }
});

app.get("/api/products/:id", async (req, res) => {
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  if (useLocalCatalog()) {
    const product = localProducts().find((item) => item.sku === req.params.id || item.id === req.params.id);
    if (!product) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ source: "demo", product });
  }
  try {
    const data = await readHamburgSources();
    const product = data.products.find((item) => item.id === req.params.id || item.sku === req.params.id);
    if (!product) return res.status(404).json({ error: "NOT_FOUND", source: "sheets" });
    res.json({ source: "sheets", product: withMedia(product) });
  } catch (error) {
    const failure = sheetsFailure(error);
    res.status(failure.status).json(failure.body);
  }
});

function buyerCourier(item) {
  return {
    courier_id: item.courier_id,
    name: item.name,
    time_from: item.time_from,
    time_to: item.time_to,
    meeting_place: item.meeting_place || "",
    slots: slots(item),
  };
}

app.get("/api/couriers", async (req, res) => {
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  if (useLocalCatalog()) {
    return res.json({
      source: "demo",
      couriers: workbook().couriers.filter((item) => item.active).map(buyerCourier),
    });
  }
  try {
    const data = await readHamburgSources();
    res.json({
      source: "sheets",
      city: "HH",
      warehouseConfirmed: false,
      couriers: data.couriers.map(buyerCourier),
      courierSheet: data.courierSheet,
    });
  } catch (error) {
    const failure = sheetsFailure(error);
    res.status(failure.status).json(failure.body);
  }
});

app.post("/api/order/create", beginOrderTrace, refuseEphemeralOrders, requireAuth, async (req, res) => {
  const city = cityOf(req.body?.city);
  const items = req.body?.items;
  if (!city || !Array.isArray(items) || items.length === 0) {
    mark(req, "ORDER_VALIDATED", "INVALID_ORDER");
    return res.status(400).json({ error: "Invalid order data" });
  }
  if (!acceptState(res, req.orderTraceId)) return;
  const headerKey = String(req.headers["idempotency-key"] || "").trim();
  const key = headerKey ? `${req.user.tg_id}:${headerKey}` : "";
  if (key) {
    const existing = db().orderIdempotency[key];
    if (existing && existing.expiresAt > Date.now() && existing.payload) {
      mark(req, "ORDER_PERSISTED", "replay");
      return res.json(existing.payload);
    }
    if (existing && existing.pending) {
      mark(req, "ORDER_VALIDATED", "ORDER_IN_PROGRESS");
      return res.status(409).json({ error: "ORDER_IN_PROGRESS" });
    }
    if (key) db().orderIdempotency[key] = { pending: true, expiresAt: Date.now() + 10 * 60 * 1000 };
  }

  let catalog;
  try {
    catalog = await shopCatalog();
  } catch (error) {
    if (key) delete db().orderIdempotency[key];
    const failure = sheetsFailure(error);
    mark(req, "ORDER_VALIDATED", failure.body.error);
    return res.status(failure.status).json(failure.body);
  }
  const normalized = [];
  for (const item of items) {
    const sku = String(item.productId || "");
    const qty = Number(item.quantity);
    const product = catalog.products.find((row) => row.sku === sku);
    if (!product || !product.active) {
      if (key) delete db().orderIdempotency[key];
      mark(req, "ORDER_VALIDATED", "PRODUCT_NOT_FOUND");
      return res.status(404).json({ error: `Product not found: ${sku}` });
    }
    const reserved = activeReservations(sku).reduce((sum, row) => sum + row.qty, 0);
    if (Number(product.stock) - reserved < qty || qty < 1) {
      if (key) delete db().orderIdempotency[key];
      mark(req, "ORDER_VALIDATED", "INSUFFICIENT_STOCK");
      return res.status(409).json({ error: `Insufficient stock for ${sku}` });
    }
    normalized.push({
      productId: sku,
      quantity: qty,
      price: Number(product.price),
      name: product.name,
      category: product.category,
      variant: item.variant ? String(item.variant) : "",
    });
  }

  const priced = priceOrder(normalized, workbook().liquidPrices, req.body?.promoCode, req.user, db().promos);
  if (!priced.ok) {
    if (key) delete db().orderIdempotency[key];
    mark(req, "ORDER_VALIDATED", priceFailureCode(priced.error));
    return res.status(400).json({ error: priced.error });
  }
  mark(req, "ORDER_VALIDATED", "ok");
  if (priced.usedDeferred > 0) req.user.deferred_discount = 0;

  const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const order = {
    id: orderId,
    user_id: req.user.tg_id,
    username: req.user.username || "",
    city,
    status: "buffer",
    total_amount: priced.total,
    subtotal_amount: priced.subtotal,
    discount_amount: priced.discount,
    promo_code: priced.promo,
    delivery_method: "",
    courier_id: "",
    delivery_date: "",
    delivery_time: "",
    delivery_address: "",
    comment: "",
    user_name: req.user.username ? `@${req.user.username}` : req.user.first_name,
    user_phone: "",
    stock_committed: false,
    payment_method: "",
    bonus_applied: 0,
    final_amount: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + RESERVATION_TTL_MS).toISOString(),
    delivered_at: "",
    cancelled_at: "",
    cancel_reason: "",
  };
  db().orders[orderId] = order;
  for (const item of normalized) {
    db().items.push({ order_id: orderId, ...item });
    addReservation(orderId, item.productId, item.quantity, RESERVATION_TTL_MS);
  }
  mark(req, "RESERVATION_CREATED", "ok");
  upsertOrderRow(blankOrderRow({
    order_id: orderId,
    user_id: req.user.tg_id,
    status: "buffer",
    total_amount: priced.total,
    subtotal_amount: priced.subtotal,
    discount_amount: priced.discount,
    promo_code: priced.promo,
    created_at: order.created_at,
    item_count: String(normalized.length),
    items_json: JSON.stringify(normalized),
    user_name: order.user_name,
    stock_committed: "FALSE",
  }), { persist: false });
  const payload = {
    orderId,
    orderText: `Новый заказ ${orderId}\nСумма: ${priced.total}\nТовары: ${normalized.length} позиций`,
    totalAmount: priced.total,
    status: "buffer",
    expiresAt: order.expires_at,
  };
  if (key) db().orderIdempotency[key] = { payload, expiresAt: Date.now() + 10 * 60 * 1000 };
  try {
    await persist();
  } catch (error) {
    console.error("Order persist failed:", error?.code || error?.message || "error");
    dropUnsavedOrder(orderId, key);
    mark(req, "ORDER_PERSISTED", "PERSIST_FAILED");
    return res.status(500).json({ error: "Order was not saved" });
  }
  mark(req, "ORDER_PERSISTED", "ok");
  res.json(payload);
});

function dropUnsavedOrder(orderId, key) {
  delete db().orders[orderId];
  db().items = db().items.filter((item) => item.order_id !== orderId);
  db().reservations = db().reservations.filter((item) => item.order_id !== orderId);
  const rows = workbook().orders;
  const index = rows.findIndex((item) => String(item.order_id) === String(orderId));
  if (index >= 0) rows.splice(index, 1);
  if (key) delete db().orderIdempotency[key];
}

app.post("/api/order/confirm", beginOrderTrace, refuseEphemeralOrders, requireAuth, async (req, res) => {
  const order = db().orders[String(req.body?.orderId || "")];
  const city = cityOf(req.body?.city || order?.city);
  if (!order || !city) {
    mark(req, "ORDER_VALIDATED", "ORDER_NOT_FOUND");
    return res.status(404).json({ error: "Order not found" });
  }
  if (order.user_id !== req.user.tg_id) {
    mark(req, "ORDER_VALIDATED", "FORBIDDEN");
    return res.status(403).json({ error: "Forbidden" });
  }
  const method = String(req.body?.deliveryMethod || "");
  if (method !== "courier" && method !== "pickup") {
    mark(req, "ORDER_VALIDATED", "INVALID_DELIVERY");
    return res.status(400).json({ error: "Invalid delivery method" });
  }
  let catalog;
  try {
    catalog = await shopCatalog();
  } catch (error) {
    const failure = sheetsFailure(error);
    mark(req, "ORDER_VALIDATED", failure.body.error);
    return res.status(failure.status).json(failure.body);
  }
  const courier = catalog.couriers.find((item) => item.active && item.courier_id === String(req.body?.courier_id || ""));
  if (!courier) {
    mark(req, "ORDER_VALIDATED", "NO_COURIER");
    return res.status(400).json({ error: "Выберите курьера" });
  }
  const time = String(req.body?.delivery_time || "");
  if (!slots(courier).includes(time)) {
    mark(req, "ORDER_VALIDATED", "NO_SLOT");
    return res.status(400).json({ error: "Выберите время" });
  }
  const data = {
    ...(req.body?.courierData || {}),
    user: {
      tgId: req.user.tg_id,
      username: req.user.username || "",
      name: [req.user.first_name, req.user.last_name].filter(Boolean).join(" ").trim(),
    },
  };
  const typed = String(data.address || "").trim();
  const place = method === "pickup" && courier.meeting_place ? courier.meeting_place : typed;
  const next = {
    method,
    courier: courier.courier_id,
    date: String(req.body?.delivery_date || ""),
    time,
    place,
    comment: String(data.comment || "").trim(),
  };
  let result;
  try {
    result = await withOrderLock(order.id, () => applyConfirm(order, next, data, courier, req.orderTraceId));
  } catch (error) {
    const status = Number(error.status || 500);
    mark(req, "ORDER_VALIDATED", status === 409 ? "CONFIRM_CONFLICT" : status === 400 ? "CONFIRM_REJECTED" : "CONFIRM_FAILED");
    return res.status(error.status || 500).json({ error: error.message || "Error" });
  }
  try {
    await whenPersisted();
  } catch (error) {
    console.error("Order persist failed:", error?.code || error?.message || "error");
    mark(req, "ORDER_PERSISTED", "PERSIST_FAILED");
    return res.status(500).json({ error: "Order was not saved" });
  }
  if (result.payload?.error && /^[A-Z0-9_]+$/.test(result.payload.error)) mark(req, "ORDER_VALIDATED", result.payload.error);
  else if (result.status === 200) mark(req, "ORDER_PERSISTED", "ok");
  res.status(result.status).json(result.payload);
});

app.post("/api/order/payment", refuseEphemeralOrders, requireAuth, (req, res) => {
  const orderId = String(req.body?.orderId || "");
  const order = db().orders[orderId];
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.user_id !== req.user.tg_id) return res.status(403).json({ error: "Forbidden" });
  const paymentKey = `${req.user.tg_id}:${orderId}`;
  const cached = db().paymentIdempotency[paymentKey];
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);
  if (!String(order.delivery_method || "").trim()) return res.status(400).json({ error: "Order must be confirmed before payment" });
  const method = String(req.body?.paymentMethod || "").trim();
  if (method !== "cash" && method !== "card") return res.status(400).json({ error: "Payment method is required" });
  const current = normalizeStatus(order.status);
  if (current === "delivered" || current === "cancelled") {
    const payload = { success: true, status: current, finalAmount: order.final_amount, bonusApplied: order.bonus_applied || 0, paymentMethod: order.payment_method };
    return res.json(payload);
  }
  if (order.payment_method) {
    const payload = { success: true, status: normalizeStatus(order.status), finalAmount: order.final_amount, bonusApplied: order.bonus_applied || 0, paymentMethod: order.payment_method };
    db().paymentIdempotency[paymentKey] = { payload, expiresAt: Date.now() + 5 * 60 * 1000 };
    persist();
    return res.json(payload);
  }
  if (current === "buffer") order.status = "pending";
  const want = Number(req.body?.bonusApplied || 0);
  if (!Number.isFinite(want) || want < 0) return res.status(400).json({ error: "Invalid bonusApplied" });
  const balance = Number(req.user.bonus_balance || 0);
  const bonusUsed = Math.min(balance, want, Number(order.total_amount) * 0.5);
  if (bonusUsed > 0) req.user.bonus_balance = money(balance - bonusUsed);
  const paid = money(Number(order.total_amount) - bonusUsed);
  order.payment_method = method;
  order.bonus_applied = money(bonusUsed);
  order.final_amount = paid;
  const earn = CASHBACK_PERCENT > 0 ? money(paid * CASHBACK_PERCENT / 100) : 0;
  order.cashback_earned = earn;
  if (earn > 0) req.user.bonus_balance = money(Number(req.user.bonus_balance || 0) + earn);
  const referredBy = String(req.user.referred_by || "");
  if (referredBy && !req.user.first_paid_order_at) {
    req.user.first_paid_order_at = new Date().toISOString();
    const referrer = db().users[referredBy];
    let referralAmount = 0;
    if (referrer) {
      referrer.referral_conversions = Number(referrer.referral_conversions || 0) + 1;
      if (REFERRAL_REQUIRED > 0 && referrer.referral_conversions % REFERRAL_REQUIRED === 0) {
        referralAmount = REFERRAL_BONUS;
        referrer.bonus_balance = money(Number(referrer.bonus_balance || 0) + REFERRAL_BONUS);
      }
    }
    order.referral_bonus = { tgId: referredBy, amount: referralAmount, conversions: 1, first: true };
  }
  releaseReservations(order.id);
  upsertOrderRow({
    order_id: order.id,
    status: normalizeStatus(order.status),
    payment_method: method,
    bonus_applied: order.bonus_applied ? String(order.bonus_applied) : "",
    final_amount: String(paid),
  });
  const payload = { success: true, status: normalizeStatus(order.status), finalAmount: paid, bonusApplied: order.bonus_applied, paymentMethod: method };
  db().paymentIdempotency[paymentKey] = { payload, expiresAt: Date.now() + 5 * 60 * 1000 };
  persist();
  res.json(payload);
});

app.get("/api/order/history", requireAuth, (req, res) => {
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  if (!acceptState(res)) return;
  const orders = Object.values(db().orders)
    .filter((order) => order.user_id === req.user.tg_id && order.city === city)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(customerOrder);
  res.json({ orders });
});

app.get("/api/courier/orders", requireAuth, async (req, res) => {
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  const status = req.user.status;
  if (status !== "courier" && status !== "admin") return res.status(403).json({ error: "Forbidden" });
  let courierId = "";
  if (status === "admin" && req.query.courierId) courierId = String(req.query.courierId);
  else {
    const courier = await courierForUser(req.user);
    if (!courier) return res.status(403).json({ error: "Forbidden" });
    courierId = courier.courier_id;
  }
  const orders = Object.values(db().orders)
    .filter((order) => order.city === city && order.courier_id === courierId && normalizeStatus(order.status) !== "buffer")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(courierOrder);
  res.json({ orders });
});

async function applyCourierStatus(user, orderId, next, reason) {
  const order = db().orders[String(orderId || "")];
  const status = normalizeStatus(next);
  if (user.status !== "courier" && user.status !== "admin") {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }
  if (!["assigned", "picked_up", "delivered", "cancelled"].includes(status)) {
    const error = new Error("Invalid status");
    error.status = 400;
    throw error;
  }
  const courier = await courierForUser(user);
  if (user.status === "courier") {
    if (!courier || order.courier_id !== courier.courier_id) {
      const error = new Error("Forbidden");
      error.status = 403;
      throw error;
    }
  }
  return withOrderLock(order.id, () => {
    const current = normalizeStatus(order.status);
    if (!["pending", "assigned", "picked_up"].includes(current)) {
      const error = new Error(current === "delivered" ? "Заказ уже завершён" : "Invalid status");
      error.status = 400;
      throw error;
    }
    if (status === "cancelled") {
      const text = String(reason || "").trim();
      if (!text || text.length > 200) {
        const error = new Error("Укажите причину");
        error.status = 400;
        throw error;
      }
      returnStock(order, text);
      return { ok: true, status: "cancelled" };
    }
    if (status === "delivered") {
      if (!order.cash_at) {
        const expected = Math.round(Number(order.total_amount) * 100) / 100;
        order.cash_received = expected;
        order.cash_delta = 0;
        order.cash_by = String(user.tg_id);
        order.cash_at = new Date().toISOString();
      }
      order.delivered_at = order.cash_at || new Date().toISOString();
    }
    order.status = status;
    upsertOrderRow({
      order_id: order.id,
      status: status,
      delivered_at: order.delivered_at || "",
      cancelled_at: order.cancelled_at || "",
      cancel_reason: order.cancel_reason || "",
    });
    return { ok: true, status };
  });
}

async function applyCourierCash(user, orderId, received) {
  const order = db().orders[String(orderId || "")];
  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }
  const courier = await courierForUser(user);
  if (!courier || order.courier_id !== courier.courier_id) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  const expected = Math.round(Number(order.total_amount) * 100) / 100;
  const amount = received == null ? expected : Math.round(Number(received) * 100) / 100;
  if (!Number.isFinite(expected) || !Number.isFinite(amount) || amount < 0 || amount - expected > 0.001) {
    const error = new Error("Некорректная сумма");
    error.status = 400;
    throw error;
  }
  return withOrderLock(order.id, () => {
    const current = normalizeStatus(order.status);
    if (!["pending", "assigned", "picked_up"].includes(current) || order.cash_at) {
      const error = new Error("Заказ уже завершён");
      error.status = 400;
      throw error;
    }
    order.cash_received = amount;
    order.cash_delta = Math.round((amount - expected) * 100) / 100;
    order.cash_by = String(user.tg_id);
    order.cash_at = new Date().toISOString();
    order.status = "delivered";
    order.delivered_at = order.cash_at;
    upsertOrderRow({
      order_id: order.id,
      status: "delivered",
      delivered_at: order.delivered_at,
    });
    return { ok: true, status: "delivered", expected, received: amount, delta: order.cash_delta };
  });
}

app.post("/api/courier/orders/status", requireAuth, async (req, res) => {
  const city = cityOf(req.body?.city);
  if (!city) return res.status(400).json({ error: "City parameter is required" });
  let payload;
  try {
    payload = await applyCourierStatus(req.user, req.body?.orderId, req.body?.status, req.body?.reason);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Error" });
  }
  try {
    await whenPersisted();
  } catch (error) {
    console.error("Order persist failed:", error?.code || error?.message || "error");
    return res.status(500).json({ error: "Order was not saved" });
  }
  res.json(payload);
});

app.get("/api/admin/orders", requireAuth, (req, res) => {
  if (req.user.status !== "admin") return res.status(403).json({ error: "Forbidden" });
  const city = cityOf(req.query.city || CITY);
  if (!city) return res.status(400).json({ error: "INVALID_CITY" });
  const orders = Object.values(db().orders)
    .filter((order) => order.city === city)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(customerOrder);
  res.json({ orders });
});

app.post("/api/admin/orders/status", requireAuth, async (req, res) => {
  if (req.user.status !== "admin") return res.status(403).json({ error: "Forbidden" });
  const city = cityOf(req.body?.city);
  const order = db().orders[String(req.body?.orderId || "")];
  const next = normalizeStatus(req.body?.status);
  if (!city) return res.status(400).json({ error: "City parameter is required" });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!["pending", "assigned", "picked_up", "delivered", "cancelled"].includes(next)) return res.status(400).json({ error: "Invalid status" });
  const previousCourier = order.courier_id;
  if (next === "cancelled") {
    if (normalizeStatus(order.status) === "delivered") return res.status(409).json({ error: "Заказ уже выдан" });
    try {
      await withOrderLock(order.id, () => returnStock(order, String(req.body?.reason || "").trim() || "Отмена администратора"));
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Error" });
    }
    order.courier_id = previousCourier;
    return res.json({ ok: true, status: "cancelled", courier_id: order.courier_id });
  }
  order.status = next;
  order.courier_id = previousCourier;
  if (next === "delivered") order.delivered_at = new Date().toISOString();
  upsertOrderRow({ order_id: order.id, status: next, courier_id: previousCourier, delivered_at: order.delivered_at || "", cancelled_at: order.cancelled_at || "" });
  res.json({ ok: true, status: next, courier_id: order.courier_id });
});

function ownOrders(tgId) {
  return Object.values(db().orders)
    .filter((order) => order.user_id === String(tgId))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function botContext() {
  return {
    miniAppUrl: process.env.MINIAPP_PUBLIC_URL || "",
    ordersReady: storageMode() === "persistent",
    managerId: String(process.env.SUPPORT_TG_ID || "").trim(),
    ensureUser(from) {
      const user = ensureUser(from.id, from.username, from.first_name);
      if (from.username) user.username = from.username;
      if (from.first_name) user.first_name = from.first_name;
      user.lang = language(from.language_code);
      syncRole(user);
      persist();
      return user;
    },
    async refreshCourier(user) {
      if (user.status === "admin") return;
      const courier = await courierForUser(user);
      if (courier) user.status = "courier";
      else if (user.status === "courier") user.status = "user";
    },
    ordersFor(tgId) {
      return ownOrders(tgId);
    },
    orderFor(tgId, orderId) {
      const order = db().orders[String(orderId || "")];
      if (!order || order.user_id !== String(tgId)) return null;
      return order;
    },
    items(orderId) {
      return orderItems(orderId);
    },
    profile(user) {
      const delivered = ownOrders(user.tg_id).filter((order) => normalizeStatus(order.status) === "delivered");
      const last = delivered.map((order) => order.delivered_at || order.created_at).sort().at(-1) || "";
      return { delivered: delivered.length, last, level: Math.min(10, delivered.length + 1) };
    },
    async saveTicket(user, orderId, text) {
      const owned = orderId && db().orders[orderId]?.user_id === user.tg_id ? orderId : "";
      const ticket = {
        id: `SUP-${Date.now().toString(36).toUpperCase()}`,
        user_id: user.tg_id,
        username: user.username || "",
        order_id: owned,
        text,
        status: "open",
        created_at: new Date().toISOString(),
      };
      db().tickets.push(ticket);
      persist();
      const manager = String(process.env.SUPPORT_TG_ID || "").trim();
      if (manager) {
        const notice = enqueueNotice({
          recipient: manager,
          orderId: ticket.id,
          kind: "support",
          text: `Обращение ${ticket.id}\n${ticket.user_id}\n${owned || "—"}\n${text}`,
        });
        await trySendNotice(notice, async (item) => {
          const token = String(process.env.TELEGRAM_BOT_TOKEN || "");
          const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: item.recipient, text: item.text }),
            signal: AbortSignal.timeout(8000),
          });
          return response.ok;
        });
      }
      return ticket;
    },
    async relayToCourier(user, orderId, text) {
      const order = db().orders[String(orderId || "")];
      if (!order || order.user_id !== String(user?.tg_id || "")) return { ok: false };
      if (!["pending", "assigned", "picked_up"].includes(normalizeStatus(order.status))) return { ok: false, closed: true };
      const courier = await courierRecord(order.courier_id);
      const body = String(text || "").trim().slice(0, 500);
      if (!courier || !body) return { ok: false };
      const html = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const notice = enqueueNotice({
        recipient: /^\d+$/.test(String(courier.tg_id || "")) ? String(courier.tg_id) : "",
        orderId: `${order.id}:${Date.now().toString(36)}`,
        kind: "relay",
        text: `Сообщение по заказу ${html(order.id)}\n${html(body)}`,
      });
      await trySendNotice(notice, sendStoredNotice);
      return { ok: Boolean(notice.sent) };
    },
    courierOrders(user, mode) {
      return this.courierBoard(user, mode);
    },
    async courierBoard(user) {
      const courier = await courierForUser(user);
      if (!courier) return null;
      const open = new Set(["pending", "assigned", "picked_up"]);
      return Object.values(db().orders)
        .filter((order) => order.courier_id === courier.courier_id && open.has(normalizeStatus(order.status)))
        .map((order) => ({
          id: order.id,
          status: normalizeStatus(order.status),
          total_amount: Number(order.total_amount),
          delivery_date: order.delivery_date || "",
          delivery_time: order.delivery_time || "",
          delivery_address: order.delivery_address || "",
          user_name: order.user_name || "",
          username: order.username || "",
          payment_method: order.payment_method || "cash",
          lines: orderItems(order.id).map((item) => ({ name: item.name, variant: item.variant || "", quantity: item.quantity })),
        }))
        .sort((a, b) => `${a.delivery_date} ${a.delivery_time}`.localeCompare(`${b.delivery_date} ${b.delivery_time}`));
    },
    async courierOrder(user, orderId) {
      const order = db().orders[String(orderId || "")];
      const courier = await courierForUser(user);
      if (!order || !courier || order.courier_id !== courier.courier_id) return null;
      return {
        ...order,
        status: normalizeStatus(order.status),
        lines: orderItems(order.id),
        contact: "",
      };
    },
    async deliver(user, orderId) {
      return this.collect(user, orderId, null);
    },
    async collect(user, orderId, received) {
      try {
        const result = await applyCourierCash(user, orderId, received);
        return { ok: true, ...result };
      } catch (error) {
        return { ok: false, closed: error.message === "Заказ уже завершён", invalid: error.message === "Некорректная сумма" };
      }
    },
    async cancel(user, orderId, reason) {
      try {
        await applyCourierStatus(user, orderId, "cancelled", reason);
        return { ok: true };
      } catch (error) {
        return { ok: false, closed: error.status === 400 && error.message !== "Укажите причину" };
      }
    },
    summaryText() {
      const orders = Object.values(db().orders);
      const count = (status) => orders.filter((order) => normalizeStatus(order.status) === status).length;
      const pendingMoves = db().stockMoves.filter((item) => item.status === "pending").length;
      return [
        "📊 Сводка",
        `Создано: ${orders.length}`,
        `Выдано: ${count("delivered")}`,
        `Отменено: ${count("cancelled")}`,
        `Не закрыто: ${count("pending") + count("assigned") + count("picked_up")}`,
        "Незакрытые заказы не считаются выручкой.",
        `Незавершённые складские шаги: ${pendingMoves}`,
      ].join("\n");
    },
    adminOrdersText() {
      const lines = Object.values(db().orders)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 5)
        .map((order) => `${order.id} · ${normalizeStatus(order.status)}`);
      return ["📦 Заказы", lines.join("\n") || "Пусто."].join("\n");
    },
    adminCouriersText() {
      const lines = workbook().couriers.map((courier) => `${courier.name} · ${courier.active ? "активен" : "выключен"}`);
      return ["🚚 Курьеры", lines.join("\n") || "Пусто."].join("\n");
    },
    async healthText() {
      let sheets = "HH: не проверялось";
      try {
        const report = hhTabReport(await listSheetTitles());
        sheets = report.expected.map((item) => `${item.name}: ${item.present ? "есть" : "нет"}`).join("\n");
      } catch (error) {
        sheets = `HH: ${error.code || "SHEETS_ERROR"}`;
      }
      return [
        "📋 Интеграции",
        `Город: ${CITY}`,
        `Каталог: ${useLocalCatalog() ? "demo" : "sheets"}`,
        "Запись в таблицу: выключена",
        `Бот: ${process.env.TELEGRAM_BOT_TOKEN ? "токен задан" : "токен не задан"}`,
        `Mini App: ${httpsUrl(process.env.MINIAPP_PUBLIC_URL) ? "HTTPS задан" : "нет публичного URL"}`,
        sheets,
      ].join("\n");
    },
    ticketsText() {
      const lines = (db().tickets || []).slice(-5).map((ticket) => `${ticket.id} · ${ticket.user_id}`);
      return ["💬 Обращения", lines.join("\n") || "Пусто."].join("\n");
    },
  };
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.post("/api/telegram/webhook", async (req, res) => {
  if (!sameSecret(req.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const outcome = await onceUpdate(req.body, () => dispatchUpdate(String(process.env.TELEGRAM_BOT_TOKEN || ""), req.body || {}, botContext()));
    if (outcome?.duplicate) return res.json({ ok: true, duplicate: true });
  } catch (error) {
    console.error("Webhook error:", error?.code || error?.message || "error");
    if (!res.headersSent) return res.status(500).json({ ok: false });
  }
  if (!res.headersSent) res.json({ ok: true });
});

function fileCredentialConfigured() {
  const inline = String(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || "").trim();
  if (inline.startsWith("{")) return true;
  if (String(process.env.GOOGLE_CREDENTIALS_BASE64 || "").trim()) return true;
  const jsonPath = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || inline || "").trim();
  if (!jsonPath || jsonPath.startsWith("{")) return false;
  return fs.existsSync(path.resolve(jsonPath));
}

function missingEnv() {
  if (process.env.NODE_ENV !== "production") return [];
  const names = [
    "CITY_CODE",
    "CITY_NAME",
    "MINIAPP_PUBLIC_URL",
    "PUBLIC_API_URL",
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "BOT_MODE",
    "JWT_SECRET",
  ];
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const key = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  if (!(email && key) && !fileCredentialConfigured()) {
    if (!email) names.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    if (!key) names.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }
  return names.filter((name) => !String(process.env[name] || "").trim());
}

async function reportSheets() {
  try {
    const account = loadServiceAccount();
    const meta = await spreadsheetMeta();
    const missing = sheetTabs().filter((name) => !meta.titles.includes(name));
    console.log(`Sheets auth: ${account.method}`);
    console.log(`Spreadsheet: ${meta.title || "—"}`);
    if (missing.length) console.error(`SHEETS_FAILED missing ${missing.join(", ")}`);
  } catch (error) {
    const code = ["SHEETS_NOT_CONFIGURED", "SHEETS_AUTH_INCOMPLETE", "SHEETS_AUTH_INVALID", "SHEETS_TIMEOUT", "SHEETS_FAILED"].includes(error.code)
      ? error.code
      : "SHEETS_FAILED";
    console.error(`SHEETS_FAILED ${code}`);
  }
}

let reservationTimer;

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distDir, "index.html"), (error) => error && next());
  });
}

function startReservationCleanup() {
  try {
    expireReservations();
    console.log("Reservation cleanup: ok");
  } catch (error) {
    console.error(`Reservation cleanup error: reservations=${fieldKind("reservations")} ${error?.code || error?.message || "error"}`);
    return;
  }
  reservationTimer = setInterval(() => {
    try {
      expireReservations();
    } catch (error) {
      console.error(`Reservation cleanup error: reservations=${fieldKind("reservations")} ${error?.code || error?.message || "error"}`);
    }
    scheduleNoticeRetry();
  }, 60 * 1000);
  reservationTimer.unref?.();
}

function courierRecord(courierId) {
  const id = String(courierId || "");
  if (!id) return null;
  if (useLocalCatalog()) return workbook().couriers.find((item) => item.courier_id === id && item.active) || null;
  return readHamburgSources()
    .then((data) => (data.couriers || []).find((item) => item.courier_id === id && item.active) || workbook().couriers.find((item) => item.courier_id === id && item.active) || null)
    .catch(() => workbook().couriers.find((item) => item.courier_id === id && item.active) || null);
}

async function sendStoredNotice(item) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "");
  const kind = String(item.kind || String(item.id || "").split(":")[0]);
  const orderKey = kind === "courier" && /^[A-Za-z0-9_-]{1,40}$/.test(String(item.order_id || "")) ? String(item.order_id) : "";
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: item.recipient,
      text: item.text,
      parse_mode: "HTML",
      reply_markup: orderKey ? { inline_keyboard: [[{ text: "Открыть заказ", callback_data: `c:od:${orderKey}` }]] } : undefined,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  const description = response.ok ? "" : String(data?.description || "");
  item.http_status = response.status;
  return { ok: response.ok, code: response.ok ? "" : telegramFailureCode(response.status, description), messageId: data?.result?.message_id };
}

let noticeRetry = null;
const noticeRetryLog = new Map();

async function retryOpenNotices() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const pending = db().notices.filter((notice) => !notice.sent && notice.status !== "sent" && Number(notice.attempts || 0) < 5 && !(notice.status === "blocked" && telegramTestMode()));
  for (const notice of pending) {
    const orderId = String(notice.order_id || "").split(":")[0];
    const order = orderId ? db().orders[orderId] : null;
    if (order && (notice.kind === "courier" || String(notice.id || "").startsWith("courier:"))) {
      const courier = await courierRecord(order.courier_id);
      bindNoticeRecipient(notice, courier?.tg_id);
    }
    await trySendNotice(notice, sendStoredNotice);
    const code = notice.sent ? "SENT" : (notice.last_error || notice.status || "HELD");
    const seen = `${code}:${notice.telegram_message_id || 0}`;
    if (noticeRetryLog.get(notice.id) !== seen) {
      noticeRetryLog.set(notice.id, seen);
      const safeOrder = orderId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      console.log(`Notice retry order=${safeOrder} code=${code} http=${Number(notice.http_status || 0)} message=${Number(notice.telegram_message_id || 0)}`);
    }
  }
}

function scheduleNoticeRetry() {
  if (noticeRetry) return;
  noticeRetry = retryOpenNotices().catch((error) => {
    console.error("Notice retry:", error?.code || error?.message || "error");
  }).finally(() => {
    noticeRetry = null;
  });
}

async function boot() {
  const mode = await hydrateStore();
  console.log(`Storage: ${mode}`);
  startReservationCleanup();
  resumeStockMoves();
  await reportSheets();
  const host = "0.0.0.0";
  const missing = missingEnv();
  if (missing.length) console.error(`Missing env: ${missing.join(", ")}`);
  if (process.env.ENABLE_LIVE_WRITES === "true" || process.env.SHEETS_READ_ONLY === "0") {
    console.error("Live writes requested. They stay disabled.");
  }
  const server = app.listen(PORT, host, () => {
    console.log(`ELFIN API on ${host}:${PORT}`);
  });
  const stop = () => {
    clearInterval(reservationTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const production = process.env.NODE_ENV === "production";
  const polling = process.env.TELEGRAM_POLLING === "1" && process.env.BOT_MODE !== "webhook" && !production;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    configureBot(process.env.TELEGRAM_BOT_TOKEN).then(() => scheduleNoticeRetry()).catch((error) => {
      console.error("Bot setup:", error?.code || error?.message || "error");
    });
  }
  if (production && process.env.TELEGRAM_POLLING === "1") console.error("Polling is disabled in production. Use BOT_MODE=webhook.");
  if (polling && process.env.TELEGRAM_BOT_TOKEN) {
    const poll = new AbortController();
    process.once("SIGTERM", () => poll.abort());
    runPolling({ token: process.env.TELEGRAM_BOT_TOKEN, ctx: botContext(), signal: poll.signal }).catch((error) => {
      console.error("Bot polling stopped:", error?.code || error?.message || "error");
    });
  }
}

if (process.env.NODE_ENV === "test") resumeStockMoves();
else boot().catch((error) => {
  console.error("Storage init failed:", error?.code || error?.message || "error");
  process.exit(1);
});

export { app, expireReservations, resumeStockMoves };

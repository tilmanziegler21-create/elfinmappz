import { loadEnvFiles } from "./loadEnv.js";
import { httpsUrl } from "./bot.js";

loadEnvFiles();
const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const api = httpsUrl(process.env.PUBLIC_API_URL);

function fail(text) {
  console.error(text);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN пуст. Webhook не настраивался.");
if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) fail("Формат токена неверный. Webhook не настраивался.");

let me;
try {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
  me = await response.json().catch(() => ({}));
  if (response.status === 401 || me.ok === false && response.status === 401) {
    fail("getMe 401 Unauthorized. В BotFather выполните /token, замените TELEGRAM_BOT_TOKEN и повторите. Webhook не настраивался.");
  }
  if (!me.ok) fail(`getMe не прошёл: ${String(me.description || response.status).replaceAll(token, "[token]")}. Webhook не настраивался.`);
} catch {
  fail("getMe не ответил. Webhook не настраивался.");
}

if (!api) fail("PUBLIC_API_URL должен быть публичным https://. Localhost не принимается. Webhook не настраивался.");
if (!secret) fail("TELEGRAM_WEBHOOK_SECRET пуст. Webhook не настраивался.");

const hook = `${api}/api/telegram/webhook`;
const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: hook, secret_token: secret, drop_pending_updates: false, allowed_updates: ["message", "callback_query"] }),
  signal: AbortSignal.timeout(8000),
});
const setBody = await set.json().catch(() => ({}));
if (!setBody.ok) fail(`setWebhook не прошёл: ${String(setBody.description || set.status).replaceAll(token, "[token]")}`);

const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) });
const infoBody = await info.json().catch(() => ({}));
const actual = String(infoBody.result?.url || "");
if (actual !== hook) fail("getWebhookInfo не подтвердил URL. Проверьте PUBLIC_API_URL.");
console.log(`getMe ok, бот @${me.result?.username || "без имени"}`);
console.log("webhook задан, secret передан, polling не запускался");

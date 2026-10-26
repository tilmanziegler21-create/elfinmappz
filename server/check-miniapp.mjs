import fs from "fs";
import { loadEnvFiles } from "./loadEnv.js";
import { httpsUrl } from "./bot.js";

loadEnvFiles();
const lines = [];
let failed = false;

function add(ok, text) {
  lines.push(`${ok ? "OK" : "FAIL"} ${text}`);
  if (!ok) failed = true;
}

function publicUrl(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) return "";
  if (/\s/.test(value)) add(false, `${name} содержит пробел`);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(value)) {
    add(false, `${name} указывает на localhost. Для Telegram нужен публичный https`);
    return "";
  }
  if (!httpsUrl(value)) {
    add(false, `${name} не начинается с https://`);
    return "";
  }
  return value.replace(/\/$/, "");
}

const appUrl = publicUrl("MINIAPP_PUBLIC_URL");
const apiUrl = publicUrl("PUBLIC_API_URL");
add(Boolean(appUrl), appUrl ? "публичный адрес Mini App задан" : "MINIAPP_PUBLIC_URL не готов");
add(Boolean(apiUrl), apiUrl ? "публичный адрес API задан" : "PUBLIC_API_URL не готов");
add(fs.existsSync("dist/index.html"), fs.existsSync("dist/index.html") ? "production build dist/index.html есть" : "production build не найден. Запустите npm run build");

async function ping(url, label) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    add(response.ok, `${label} ${response.status}`);
    return response;
  } catch (error) {
    add(false, `${label} недоступен${error?.name === "TimeoutError" ? ", timeout" : ""}`);
    return null;
  }
}

if (appUrl) await ping(appUrl, "frontend");
if (apiUrl) {
  const health = await ping(`${apiUrl}/api/health`, "API");
  if (health?.ok) {
    const body = await health.json().catch(() => ({}));
    add(body.city === "HH" && body.writes === false, `API город ${body.city || "—"}, запись ${body.writes === false ? "выключена" : "не выключена"}`);
  }
  const auth = await fetch(`${apiUrl}/api/auth/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: "" }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  add(Boolean(auth) && (auth.status === 401 || auth.status === 500), auth ? `initData без подписи отклонён, статус ${auth.status}` : "проверка initData не дошла до API");
}

try {
  const local = await fetch("http://127.0.0.1:8787/api/health", { signal: AbortSignal.timeout(2000) });
  add(true, `локальный API отвечает ${local.status}. Это не публичный адрес`);
} catch {
  add(true, "локальный API не запущен. На публичную кнопку это не влияет");
}

console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);

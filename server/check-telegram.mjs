import { execSync } from "child_process";
import { envNote, loadEnvFiles } from "./loadEnv.js";
import { httpsUrl } from "./bot.js";

const { notes } = loadEnvFiles();
const lines = [];
let failed = false;

function add(ok, text) {
  lines.push(`${ok ? "OK" : "FAIL"} ${text}`);
  if (!ok) failed = true;
}

const note = envNote(notes, "TELEGRAM_BOT_TOKEN");
const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
add(Boolean(token), token ? "TELEGRAM_BOT_TOKEN задан" : "TELEGRAM_BOT_TOKEN пуст");
add(!note.hadOuterSpace && !note.hasInnerSpace, note.hadOuterSpace || note.hasInnerSpace ? "в токене есть пробелы. Уберите их в окружении" : "пробелов в токене нет");
add(true, note.quoted ? "кавычки вокруг токена сняты при чтении" : "кавычек вокруг токена нет");
const format = /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token);
add(format, format ? "формат токена похож на токен BotFather" : "формат токена не совпадает с токеном BotFather");

let meOk = false;
if (token && format) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    const description = String(data.description || "").replaceAll(token, "[token]");
    meOk = Boolean(data.ok);
    if (meOk) add(true, `getMe ok, бот @${data.result?.username || "без имени"}`);
    else if (response.status === 401) add(false, "getMe 401 Unauthorized. Токен Telegram не принял. В BotFather откройте своего бота и выполните /token, затем замените TELEGRAM_BOT_TOKEN локально и перезапустите сервер");
    else add(false, `getMe ${response.status} ${description || "ошибка"}`);
  } catch (error) {
    add(false, error?.name === "TimeoutError" ? "getMe timeout" : "getMe не ответил");
  }
} else if (token) {
  add(false, "getMe не вызывался: формат токена неверный");
}

const mini = httpsUrl(process.env.MINIAPP_PUBLIC_URL);
add(Boolean(mini), mini ? "MINIAPP_PUBLIC_URL начинается с https://" : "MINIAPP_PUBLIC_URL пуст или не https. Localhost в кнопку WebApp не ставится");
add(process.env.TELEGRAM_POLLING !== "1" || meOk, process.env.TELEGRAM_POLLING === "1" ? "TELEGRAM_POLLING=1" : "polling выключен");

if (meOk) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    const hook = String(data.result?.url || "");
    const polling = process.env.TELEGRAM_POLLING === "1";
    add(!(hook && polling), hook ? `webhook задан, polling ${polling ? "тоже включён" : "выключен"}` : "webhook не задан");
  } catch {
    add(false, "getWebhookInfo не ответил");
  }
} else {
  add(false, "webhook не проверен: getMe не прошёл");
}

let processes = [];
try {
  const raw = execSync("ps -ax -o command=", { encoding: "utf8" });
  processes = raw.split("\n").filter((line) => line.trim().startsWith("node ") && line.includes("server/index.js"));
} catch {
  processes = [];
}
add(processes.length <= 1, processes.length > 1 ? `процессов API: ${processes.length}` : `процессов API: ${processes.length}`);

console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);

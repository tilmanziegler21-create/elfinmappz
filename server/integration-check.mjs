import fs from "fs";
import path from "path";
import { hhTabReport, listSheetTitles } from "./sheetsRead.js";

function applyEnvFile(file) {
  if (!file || !fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = line.slice(index + 1).trim();
  }
  return true;
}

const envFile = process.env.SHEETS_ENV_FILE || "";
const loaded = applyEnvFile(envFile);
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && !path.isAbsolute(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) && process.env.SHEETS_ENV_DIR) {
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH = path.join(process.env.SHEETS_ENV_DIR, process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH);
}

const report = {
  envFileLoaded: loaded,
  sheetsConfigured: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || process.env.GOOGLE_CREDENTIALS_BASE64)),
  credentialFileExists: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH)),
  testSpreadsheet: Boolean(process.env.SHEETS_TEST_SPREADSHEET_ID),
  miniAppHttps: String(process.env.MINIAPP_PUBLIC_URL || "").startsWith("https://"),
  polling: process.env.TELEGRAM_POLLING === "1",
  testMode: !["0", "false", "off", "no"].includes(String(process.env.TELEGRAM_TEST_MODE ?? "").trim().toLowerCase()),
  liveWrites: process.env.ENABLE_LIVE_WRITES === "true" || process.env.SHEETS_READ_ONLY === "0",
  botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  tabs: null,
  sheetsError: "",
  bot: null,
};

if (report.sheetsConfigured) {
  try {
    const titles = await listSheetTitles();
    const tabs = hhTabReport(titles);
    report.tabs = { count: titles.length, titles, expected: tabs.expected, ready: tabs.ready };
  } catch (error) {
    report.sheetsError = error.code || "SHEETS_ERROR";
  }
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    const description = String(data.description || "").replaceAll(process.env.TELEGRAM_BOT_TOKEN, "[token]");
    report.bot = { ok: Boolean(data.ok), username: data.result?.username || "", status: response.status, description };
  } catch {
    report.bot = { ok: false, username: "" };
  }
}

console.log(JSON.stringify(report, null, 2));

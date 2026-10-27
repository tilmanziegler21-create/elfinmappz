import { loadEnvFiles } from "./loadEnv.js";
import { loadServiceAccount, readTab, sheetTabs, spreadsheetMeta } from "./sheetsRead.js";
import { normalizeProducts } from "./hhNormalize.js";

const { loaded } = loadEnvFiles();
const lines = [];
let failed = false;

function add(ok, text) {
  lines.push(`${ok ? "OK" : "FAIL"} ${text}`);
  if (!ok) failed = true;
}

const idRaw = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
let authMethod = "—";
let googleAuth = false;
let title = "—";
let products = "не прочитано";
let couriers = "не прочитано";

add(loaded || Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS), loaded ? "файл окружения прочитан" : "переменные взяты из process.env");
add(Boolean(idRaw), idRaw ? `Spreadsheet ID задан, длина ${idRaw.length}, хвост ${idRaw.slice(-6)}` : "GOOGLE_SHEETS_SPREADSHEET_ID пуст");

try {
  const account = loadServiceAccount();
  authMethod = account.method;
  add(account.method === "ENV" || account.method === "FILE", account.method === "ENV" ? "авторизация: EMAIL и PRIVATE_KEY" : "авторизация: файл ключа");
} catch (error) {
  add(false, error.code === "SHEETS_AUTH_INCOMPLETE" || error.code === "SHEETS_AUTH_INVALID" ? `${error.code}` : error.code || "SHEETS_NOT_CONFIGURED");
}

if (idRaw && authMethod !== "—") {
  try {
    const meta = await spreadsheetMeta();
    googleAuth = true;
    title = meta.title || "—";
    add(true, `таблица «${meta.title}», locale ${meta.locale || "—"}, пояс ${meta.timeZone || "—"}`);
    add(true, `вкладки: ${meta.titles.join(", ")}`);
    const tabs = sheetTabs();
    const [productTab, priceTab, courierTab] = tabs;
    const missing = tabs.filter((name) => !meta.titles.includes(name));
    add(missing.length === 0, missing.length ? `нет вкладок: ${missing.join(", ")}` : `все вкладки ${productTab.split("_").pop()} на месте`);
    if (meta.titles.includes(productTab)) {
      const table = await readTab(productTab);
      const normalized = normalizeProducts(table);
      const errors = normalized.issues.filter((item) => item.level === "error");
      products = String(table.rows.length);
      add(table.headers.includes("sku") && table.headers.includes("price") && table.headers.includes("stock"), `заголовки ${productTab}: ${table.headers.join(", ") || "пусто"}`);
      add(errors.length === 0, `товаров ${table.rows.length}, ошибок типа ${errors.length}`);
    } else {
      add(false, `${productTab} не прочитана: вкладки нет`);
    }
    if (meta.titles.includes(priceTab)) {
      const table = await readTab(priceTab);
      add(true, `${priceTab} строк ${table.rows.length}`);
    } else {
      add(false, `${priceTab} не прочитана: вкладки нет`);
    }
    if (meta.titles.includes(courierTab)) {
      const table = await readTab(courierTab);
      couriers = String(table.rows.length);
      add(true, `${courierTab} строк ${table.rows.length}`);
    } else {
      add(false, `${courierTab} не прочитана: вкладки нет`);
    }
  } catch (error) {
    const code = ["SHEETS_NOT_CONFIGURED", "SHEETS_AUTH_INCOMPLETE", "SHEETS_AUTH_INVALID", "SHEETS_TIMEOUT"].includes(error.code) ? error.code : "SHEETS_FAILED";
    add(false, code);
  }
}

const writesOff = process.env.SHEETS_READ_ONLY !== "0" && process.env.ENABLE_LIVE_WRITES !== "true";
add(writesOff, "запись в рабочую таблицу выключена");
lines.push([
  `Auth Method: ${authMethod}`,
  `Google Auth: ${googleAuth ? "PASS" : "FAIL"}`,
  `Spreadsheet: ${title}`,
  "City: HH",
  `Products: ${products}`,
  `Couriers: ${couriers}`,
  `Live Writes: ${writesOff ? "DISABLED" : "REQUESTED"}`,
].join("\n"));
console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);

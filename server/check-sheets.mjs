import { loadEnvFiles } from "./loadEnv.js";
import { HH_TABS, readHeader, readTab, spreadsheetMeta } from "./sheetsRead.js";
import { normalizeProducts } from "./hhNormalize.js";

const { loaded } = loadEnvFiles();
const lines = [];
let failed = false;

function add(ok, text) {
  lines.push(`${ok ? "OK" : "FAIL"} ${text}`);
  if (!ok) failed = true;
}

const idRaw = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
add(loaded, loaded ? "файл окружения прочитан" : "файл окружения не найден: положите .env или SHEETS_ENV_FILE");
add(Boolean(idRaw), idRaw ? `Spreadsheet ID задан, длина ${idRaw.length}, хвост ${idRaw.slice(-6)}` : "GOOGLE_SHEETS_SPREADSHEET_ID пуст");
add(Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || process.env.GOOGLE_CREDENTIALS_BASE64), "путь к ключу задан");

if (idRaw) {
  try {
    const meta = await spreadsheetMeta();
    add(true, `таблица «${meta.title}», locale ${meta.locale || "—"}, пояс ${meta.timeZone || "—"}`);
    add(true, `вкладки: ${meta.titles.join(", ")}`);
    const muOnly = meta.titles.length > 0 && meta.titles.every((title) => title.endsWith("_MU"));
    const hamburgTitle = /hamburg|гамбург|\bHH\b/i.test(meta.title);
    if (muOnly && !hamburgTitle) {
      add(false, "этот ID открывает книгу другого города. HH-вкладки здесь не создаются сами. В URL Hamburg возьмите фрагмент между /d/ и /edit и замените GOOGLE_SHEETS_SPREADSHEET_ID");
    }
    const missing = HH_TABS.filter((name) => !meta.titles.includes(name));
    add(missing.length === 0, missing.length ? `нет вкладок: ${missing.join(", ")}` : "все вкладки HH на месте");
    if (meta.titles.includes("products_HH")) {
      const header = await readHeader("products_HH");
      const table = await readTab("products_HH");
      const normalized = normalizeProducts(table);
      const errors = normalized.issues.filter((item) => item.level === "error");
      add(header.includes("sku") && header.includes("price") && header.includes("stock"), `заголовки products_HH: ${header.join(", ") || "пусто"}`);
      add(errors.length === 0, `товаров ${table.rows.length}, ошибок типа ${errors.length}`);
    } else {
      add(false, "заголовки и количество товаров HH не читались: вкладки нет");
    }
  } catch (error) {
    add(false, error.code || "SHEETS_ERROR");
  }
}

add(process.env.SHEETS_READ_ONLY !== "0" && process.env.ENABLE_LIVE_WRITES !== "true", "запись в рабочую таблицу выключена");
console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);

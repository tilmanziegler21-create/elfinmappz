import { google } from "googleapis";
import { loadEnvFiles } from "./loadEnv.js";
import { loadServiceAccount } from "./sheetsRead.js";
import { HH_SCHEMA, TEST_ROWS } from "./sheetSchema.js";

loadEnvFiles();
const confirm = process.argv.includes("--confirm");
const live = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
const testId = String(process.env.SHEETS_TEST_SPREADSHEET_ID || "").trim();

console.log("Тестовая книга: искусственные строки, без контактов, заказов и остатков рабочей таблицы.");
console.log(testId ? `хвост тестового ID ${testId.slice(-6)}` : "SHEETS_TEST_SPREADSHEET_ID не задан");
for (const [name, headers] of Object.entries(HH_SCHEMA)) {
  const row = TEST_ROWS[name];
  console.log(`${name}: ${headers.join(", ")}${row.length ? " + 1 тестовая строка" : ""}`);
}

if (!testId) {
  console.log(confirm ? "Отказ: тестовая таблица не задана." : "dry-run. Запись не выполнялась.");
  process.exit(confirm ? 2 : 0);
}
if (testId === live) {
  console.error("Отказ: тестовый ID совпадает с рабочей таблицей.");
  process.exit(2);
}
if (!confirm) {
  console.log("dry-run. Запись не выполнялась. Рабочая таблица не используется.");
  process.exit(0);
}

const { email, key } = loadServiceAccount();
const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", timeout: 8000, auth });
try {
  const current = await sheets.spreadsheets.get({ spreadsheetId: testId, fields: "sheets.properties.title" });
  const titles = new Set((current.data.sheets || []).map((item) => item.properties?.title));
  const missing = Object.keys(HH_SCHEMA).filter((name) => !titles.has(name));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: testId,
      requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }
  const data = [];
  for (const [title, headers] of Object.entries(HH_SCHEMA)) {
    if (titles.has(title)) {
      console.log(`пропуск ${title}: вкладка уже есть`);
      continue;
    }
    data.push({
      range: `'${title}'!A1`,
      values: TEST_ROWS[title].length ? [headers, TEST_ROWS[title]] : [headers],
    });
  }
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: testId,
      requestBody: { valueInputOption: "RAW", data },
    });
  }
} catch (error) {
  const status = error?.response?.status || error?.code || "error";
  console.error(`Запись в тестовую таблицу не выполнена: ${status}`);
  process.exit(1);
}
console.log("Тестовая структура записана. Рабочая таблица не менялась.");

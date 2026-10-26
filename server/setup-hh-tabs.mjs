import { google } from "googleapis";
import { loadEnvFiles } from "./loadEnv.js";
import { loadServiceAccount, spreadsheetMeta } from "./sheetsRead.js";
import { HH_SCHEMA } from "./sheetSchema.js";

loadEnvFiles();
const confirm = process.argv.includes("--confirm");
const allowHere = process.argv.includes("--on-this-spreadsheet");

const meta = await spreadsheetMeta();
const foreign = meta.titles.length > 0 && meta.titles.every((title) => title.endsWith("_MU")) && !/hamburg|гамбург|\bHH\b/i.test(meta.title);
const missing = Object.keys(HH_SCHEMA).filter((name) => !meta.titles.includes(name));

console.log(`Таблица «${meta.title}», хвост ID ${meta.tail}.`);
console.log("План: только отсутствующие вкладки и строка заголовков. Строки другого города не копируются. Существующие вкладки не удаляются и не перезаписываются.");
for (const [name, headers] of Object.entries(HH_SCHEMA)) {
  console.log(`${meta.titles.includes(name) ? "пропуск" : "создать"} ${name}: ${headers.join(", ")}`);
}
if (foreign) console.log("Эта книга не похожа на Hamburg. Сначала замените GOOGLE_SHEETS_SPREADSHEET_ID на таблицу Hamburg.");

if (!confirm) {
  console.log("dry-run. Создание не выполнялось.");
  process.exit(0);
}
if (foreign && !allowHere) {
  console.error("Отказ. --confirm не выполнен. Для пустых вкладок именно в этой книге добавьте --on-this-spreadsheet.");
  process.exit(2);
}
if (!missing.length) {
  console.log("Создавать нечего.");
  process.exit(0);
}

const { email, key } = loadServiceAccount();
const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", timeout: 8000, auth });
const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
try {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: missing.map((title) => ({ range: `'${title}'!A1`, values: [HH_SCHEMA[title]] })),
    },
  });
} catch (error) {
  const status = error?.response?.status || error?.code || "error";
  console.error(`Запись не выполнена: ${status}. Для этого шага у сервисного аккаунта нужна роль Editor только на время создания вкладок. Данные не копировались.`);
  process.exit(1);
}
console.log(`Созданы пустые вкладки: ${missing.join(", ")}`);

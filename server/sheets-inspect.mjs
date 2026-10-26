import fs from "fs";
import { hhTabReport, listSheetTitles } from "./sheetsRead.js";

function applyEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

applyEnvFile(process.env.SHEETS_ENV_FILE || "");
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && !pathIsAbsolute(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) && process.env.SHEETS_ENV_DIR) {
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH = `${process.env.SHEETS_ENV_DIR}/${process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH}`;
}

function pathIsAbsolute(file) {
  return file.startsWith("/") || /^[A-Za-z]:\\/.test(file);
}

const titles = await listSheetTitles();
const report = hhTabReport(titles);
console.log(JSON.stringify({
  tabCount: titles.length,
  titles,
  expected: report.expected,
  ready: report.ready,
}, null, 2));

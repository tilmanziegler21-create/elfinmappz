import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export function sheetCode() {
  const code = String(process.env.SHEETS_TAB_CODE || "HG").trim().toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(code) ? code : "HG";
}

export function sheetTabs(code = sheetCode()) {
  return ["products", "LiquidPrices", "couriers", "orders", "metrics"].map((name) => `${name}_${code}`);
}

function env(name) {
  return String(process.env[name] || "").trim();
}

function normalizePrivateKey(raw) {
  let cleaned = String(raw || "").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("{") && cleaned.includes('"private_key"')) {
    try {
      cleaned = String(JSON.parse(cleaned).private_key || "").trim();
    } catch {
      return "";
    }
  }
  return cleaned
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function accountFromParsed(parsed) {
  if (!parsed?.client_email || !parsed?.private_key) return null;
  return { email: String(parsed.client_email), key: normalizePrivateKey(parsed.private_key) };
}

function readJsonFile(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) return null;
  return accountFromParsed(JSON.parse(fs.readFileSync(full, "utf8")));
}

function configError(code, message) {
  const error = new Error(message);
  error.status = 503;
  error.code = code;
  return error;
}

export function loadServiceAccount() {
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const rawKey = env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (email || rawKey) {
    if (!email) throw configError("SHEETS_AUTH_INCOMPLETE", "GOOGLE_SERVICE_ACCOUNT_EMAIL missing");
    if (!rawKey) throw configError("SHEETS_AUTH_INCOMPLETE", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY missing");
    const key = normalizePrivateKey(rawKey);
    if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
      throw configError("SHEETS_AUTH_INVALID", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY invalid");
    }
    return { email, key, method: "ENV" };
  }
  const direct = env("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS");
  if (direct) {
    if (direct.startsWith("{")) {
      const parsed = accountFromParsed(JSON.parse(direct));
      if (parsed) return { ...parsed, method: "FILE" };
    } else {
      const parsed = readJsonFile(direct);
      if (parsed) return { ...parsed, method: "FILE" };
    }
  }
  const b64 = env("GOOGLE_CREDENTIALS_BASE64");
  if (b64) {
    const parsed = accountFromParsed(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
    if (parsed) return { ...parsed, method: "FILE" };
  }
  const jsonPath = env("GOOGLE_SERVICE_ACCOUNT_JSON_PATH") || env("GOOGLE_APPLICATION_CREDENTIALS");
  if (jsonPath) {
    const parsed = readJsonFile(jsonPath);
    if (parsed) return { ...parsed, method: "FILE" };
  }
  throw configError("SHEETS_NOT_CONFIGURED", "Sheets not configured");
}

function api() {
  const { email, key } = loadServiceAccount();
  const auth = new google.auth.JWT({ email, key, scopes: SCOPES });
  return google.sheets({ version: "v4", timeout: 8000, auth });
}

async function request(run) {
  try {
    return await run();
  } catch (error) {
    if (["SHEETS_NOT_CONFIGURED", "SHEETS_AUTH_INCOMPLETE", "SHEETS_AUTH_INVALID"].includes(error.code)) throw error;
    const timeout = error.code === "ETIMEDOUT" || error.code === "ECONNABORTED";
    const wrapped = new Error(timeout ? "SHEETS_TIMEOUT" : "SHEETS_FAILED");
    wrapped.code = timeout ? "SHEETS_TIMEOUT" : "SHEETS_FAILED";
    wrapped.status = timeout ? 504 : 503;
    throw wrapped;
  }
}

function spreadsheetId() {
  const id = env("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (!id) {
    const error = new Error("Sheets not configured");
    error.status = 503;
    error.code = "SHEETS_NOT_CONFIGURED";
    throw error;
  }
  return id;
}

export function spreadsheetFingerprint() {
  const id = spreadsheetId();
  return { length: id.length, tail: id.slice(-6) };
}

export async function spreadsheetMeta() {
  const response = await request(() => api().spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: "properties.title,properties.locale,properties.timeZone,sheets.properties.title",
  }));
  return {
    title: String(response.data.properties?.title || ""),
    locale: String(response.data.properties?.locale || ""),
    timeZone: String(response.data.properties?.timeZone || ""),
    titles: (response.data.sheets || []).map((item) => String(item.properties?.title || "")).filter(Boolean),
    ...spreadsheetFingerprint(),
  };
}

export async function listSheetTitles() {
  const meta = await spreadsheetMeta();
  return meta.titles;
}

export function hhTabReport(titles) {
  const expected = sheetTabs();
  const found = new Set(titles);
  return {
    titles,
    expected: expected.map((name) => ({ name, present: found.has(name) })),
    ready: expected.every((name) => found.has(name)),
  };
}

export async function readHeader(title) {
  const response = await request(() => api().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${String(title).replace(/'/g, "''")}'!1:1`,
  }));
  return (response.data.values?.[0] || []).map((cell) => String(cell || "").trim());
}

export async function readTab(title) {
  const response = await request(() => api().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${String(title).replace(/'/g, "''")}'!A:Z`,
  }));
  const values = response.data.values || [];
  const headers = (values[0] || []).map((cell) => String(cell || "").trim());
  const rows = values.slice(1).filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
  return { headers, rows };
}

export const HH_TABS = sheetTabs;

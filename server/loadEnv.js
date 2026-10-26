import fs from "fs";
import path from "path";

function bare(value) {
  const trimmed = String(value || "").trim();
  const quoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

export function loadEnvFiles() {
  const files = [path.join(process.cwd(), ".env")];
  if (process.env.SHEETS_ENV_FILE) files.push(process.env.SHEETS_ENV_FILE);
  const notes = {};
  let loaded = false;
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    loaded = true;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const raw = line.slice(index + 1);
      const value = bare(raw);
      const already = Boolean(process.env[key]);
      if (!notes[key]) {
        notes[key] = {
          hadOuterSpace: raw !== raw.trim(),
          quoted: raw.trim() !== value && raw.trim().length > 0,
          hasInnerSpace: /\s/.test(value),
          length: value.length,
          fromProcess: already,
        };
      }
      if (!already) process.env[key] = value;
    }
  }
  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH;
  if (jsonPath && !path.isAbsolute(jsonPath) && process.env.SHEETS_ENV_DIR) {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH = path.join(process.env.SHEETS_ENV_DIR, jsonPath);
  }
  return { loaded, notes };
}

export function envNote(notes, key) {
  return notes[key] || { hadOuterSpace: false, quoted: false, hasInnerSpace: false, length: String(process.env[key] || "").trim().length, fromProcess: Boolean(process.env[key]) };
}

import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const port = "10000";
const env = { ...process.env, NODE_ENV: "production", PORT: port, CITY_CODE: "HH", CITY_NAME: "Hamburg", BOT_MODE: "webhook", TELEGRAM_WEBHOOK_SECRET: "render-check-secret", DATA_DIR: mkdtempSync(path.join(tmpdir(), "elfin-render-")) };
for (const name of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_POLLING", "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_SERVICE_ACCOUNT_JSON_PATH", "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS", "GOOGLE_CREDENTIALS_BASE64", "MINIAPP_PUBLIC_URL", "PUBLIC_API_URL", "FRONTEND_ORIGIN", "JWT_SECRET"]) {
  delete env[name];
}

const child = spawn(process.execPath, ["server/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const lines = [];
let failed = false;
function add(ok, text) {
  lines.push(`${ok ? "OK" : "FAIL"} ${text}`);
  if (!ok) failed = true;
}

try {
  const started = Date.now();
  while (!output.includes(`0.0.0.0:${port}`) && Date.now() - started < 8000) {
    if (child.exitCode != null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  add(output.includes(`0.0.0.0:${port}`), "API слушает 0.0.0.0:10000");
  add(output.includes("Missing env:"), "пустые production-переменные названы без значений");
  add(!output.includes("private_key") && !/bot\d+:[A-Za-z0-9_-]{10}/.test(output), "в логе старта нет секретов");

  const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
  const healthBody = await health.json();
  add(health.ok && healthBody.ok === true && healthBody.city === "HH" && healthBody.writes === false, "GET /api/health");

  const ready = await fetch(`http://127.0.0.1:${port}/api/ready`, { signal: AbortSignal.timeout(3000) });
  const readyBody = await ready.json();
  add(ready.ok && readyBody.api === "ready" && readyBody.telegram === "not configured" && readyBody.database === "ephemeral" && readyBody.writes === false, "GET /api/ready");

  const denied = await fetch(`http://127.0.0.1:${port}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  add(denied.status === 401, "webhook без секрета отклонён");
  const accepted = await fetch(`http://127.0.0.1:${port}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "render-check-secret" },
    body: JSON.stringify({ update_id: 1 }),
  });
  const again = await fetch(`http://127.0.0.1:${port}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "render-check-secret" },
    body: JSON.stringify({ update_id: 1 }),
  });
  const againBody = await again.json();
  add(accepted.status === 200 && again.status === 200 && againBody.duplicate === true, "повторный update_id не обрабатывается второй раз");

  const cors = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { origin: "https://evil.example" } });
  add(cors.headers.get("access-control-allow-origin") !== "https://evil.example", "чужой origin не разрешён");
} catch (error) {
  add(false, error?.message || "проверка не завершилась");
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode == null) child.kill("SIGKILL");
}

const tokenCheck = spawn(process.execPath, ["server/telegram-webhook.mjs"], {
  env: { ...env, TELEGRAM_BOT_TOKEN: "123456789:AAAAAAAAAAAAAAAAAAAA", PUBLIC_API_URL: "https://elfin-api.example" },
  stdio: ["ignore", "pipe", "pipe"],
});
let tokenOut = "";
tokenCheck.stdout.on("data", (chunk) => {
  tokenOut += chunk.toString();
});
tokenCheck.stderr.on("data", (chunk) => {
  tokenOut += chunk.toString();
});
const tokenExit = await new Promise((resolve) => tokenCheck.once("exit", resolve));
add(tokenExit === 1 && tokenOut.includes("401") && !tokenOut.includes("123456789:AAAAAAAAAAAAAAAAAAAA"), "невалидный токен останавливает webhook");

console.log(lines.join("\n"));
if (!output.includes(`0.0.0.0:${port}`)) console.error(output.slice(0, 500));
process.exit(failed ? 1 : 0);

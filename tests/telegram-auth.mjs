import { spawn } from "node:child_process";
import { signInitData } from "./telegram-sign.mjs";

const port = 8799;
const token = "elfin-auth-test-bot";
const child = spawn("node", ["server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    ALLOW_DEV_AUTH: "1",
    PORT: String(port),
    JWT_SECRET: "elfin-auth-test",
    DATA_DIR: `/tmp/elfin-auth-${Date.now()}`,
    DEMO_CATALOG: "1",
    CITY_CODE: "HH",
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_BOT_USERNAME: "elfin_test_bot",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

function stop() {
  child.kill("SIGTERM");
}

async function ready() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      /* boot */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("auth API did not start");
}

async function post(body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

try {
  await ready();
  const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  if (config.devAuth !== false) throw new Error("dev auth leaked into production config");
  if (config.botUsername !== "elfin_test_bot") throw new Error("bot username was not published");
  if (!Array.isArray(config.payments) || config.payments.join() !== "cash") throw new Error("payments are not cash only");
  const id = "9007199254740993";
  const now = Math.floor(Date.now() / 1000);
  const signed = await post({ initData: signInitData(`{"id":${id},"first_name":"Лея","last_name":"Норд","username":"leya"}`, now, token) });
  if (signed.status !== 200 || signed.json.user?.tgId !== id || signed.json.dev !== false) throw new Error(`signed user ${signed.status} ${signed.json.user?.tgId}`);
  if (signed.json.user.lastName !== "Норд" || signed.json.user.username !== "leya") throw new Error("profile fields were dropped");
  const bare = await post({ initData: signInitData({ id: 424242, first_name: "Без ника" }, now, token) });
  if (bare.status !== 200 || bare.json.user?.username !== "") throw new Error("missing username was stored");
  const expired = await post({ initData: signInitData({ id: 7, first_name: "Старый" }, now - 3 * 24 * 60 * 60, token) });
  if (expired.status !== 401 || expired.json.error !== "Expired initData") throw new Error(`expired ${expired.status} ${expired.json.error}`);
  const valid = signInitData({ id: 7, first_name: "Чужой" }, now, token);
  const forged = await post({ initData: valid.replace(/hash=([0-9a-f]+)/, (_, hex) => `hash=${hex.slice(0, -1)}${hex.endsWith("0") ? "1" : "0"}`) });
  if (forged.status !== 401) throw new Error(`forged status ${forged.status}`);
  const client = await post({ tgId: "123456789", username: "customer_example" });
  if (client.status !== 401) throw new Error("client-supplied id was accepted");
  console.log("telegram auth ok");
} finally {
  stop();
}

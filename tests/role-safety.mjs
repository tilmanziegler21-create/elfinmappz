import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const port = 8798;
const secret = "elfin-role-safety";
const child = spawn("node", ["server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    ALLOW_DEV_AUTH: "1",
    PORT: String(port),
    JWT_SECRET: secret,
    DATA_DIR: "/tmp/elfin-role-safety",
    DEMO_CATALOG: "1",
    CITY_CODE: "HH",
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
  throw new Error("production API did not start");
}

try {
  await ready();
  const config = await fetch(`http://127.0.0.1:${port}/api/config`);
  const body = await config.json();
  if (body.devAuth !== false) throw new Error("devAuth is on in production");
  const dev = await fetch(`http://127.0.0.1:${port}/api/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tgId: "100000009" }),
  });
  if (dev.status !== 404) throw new Error(`dev auth status ${dev.status}`);
  const token = jwt.sign({ tgId: "123456789" }, secret);
  const admin = await fetch(`http://127.0.0.1:${port}/api/admin/orders?city=HH`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (admin.status !== 403) throw new Error(`admin status ${admin.status}`);
  const courier = await fetch(`http://127.0.0.1:${port}/api/courier/orders?city=HH`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (courier.status !== 403) throw new Error(`courier status ${courier.status}`);
  console.log("role safety ok");
} finally {
  stop();
}

import crypto from "node:crypto";

export function signInitData(user, authDate, token) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", typeof user === "string" ? user : JSON.stringify(user));
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

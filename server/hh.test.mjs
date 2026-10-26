import fs from "fs";
import os from "os";
import path from "path";
import { normalizeCouriers, normalizePrices, normalizeProducts } from "./hhNormalize.js";
import { brandGroup, priceCategory, sectionLabel } from "./categoryRules.js";
import { calculateOrderPricing, priceOrder } from "./pricing.js";

process.env.NODE_ENV = "test";
process.env.SHEETS_CATALOG = "1";
process.env.DEMO_CATALOG = "0";
process.env.CITY_CODE = "HH";
process.env.CITY_NAME = "Hamburg";
process.env.CITY_CODES = "HH";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "elfin-hh-"));
process.env.JWT_SECRET = "elfin-dev-secret";

const failures = [];
function record(name, ok, detail = "") {
  if (!ok) failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
}

const headers = ["sku", "name", "category", "brand", "price", "stock", "active"];
const good = normalizeProducts({
  headers,
  rows: [
    ["a", "Альфа", "Мята", "ELFIN", "10", "2", "TRUE"],
    ["", "", "", "", "", "", ""],
    ["b", "Бета", "Холод", "ELFIN", "8", "0", "FALSE"],
  ],
});
record("sku-unique", good.issues.length === 0 && good.products.length === 2, JSON.stringify(good.issues));
record("zero-stock", good.products[0].stock === 2 && good.products[1].stock === 0);
record("inactive", good.products[1].active === false);

const duplicate = normalizeProducts({ headers, rows: [["a", "А", "Мята", "ELFIN", "1", "1", "TRUE"], ["a", "Б", "Мята", "ELFIN", "1", "1", "TRUE"]] });
record("duplicate-sku", duplicate.issues.some((item) => item.code === "DUPLICATE_SKU"));

const mapped = normalizeProducts({
  headers: [...headers, "image"],
  rows: [
    ["LQ-001", "* Apple Peach", "liquids", "ELFLIC", "16", "0", "FALSE", "/images/brands/elflic.png"],
    ["LQ-002", "* Apple Pear", "liquids1", "ELFLIC", "16", "1", "true", ""],
  ],
});
record("category-kept", mapped.issues.length === 0 && mapped.products[0].category === "liquids" && mapped.products[1].category === "liquids1");
record("flavor-is-name", mapped.products[0].flavor === "* Apple Peach" && mapped.products[0].brand === "ELFLIC");
record("image-by-row", mapped.products[0].image === "/images/brands/elflic.png" && mapped.products[1].image === "");
record("active-spellings", mapped.products[0].active === false && mapped.products[1].active === true && mapped.products[0].stock === 0);

record("section-one", sectionLabel("liquids") === "Жидкости" && sectionLabel("liquids1") === "Жидкости" && priceCategory("liquids") === "liquids" && priceCategory("liquids1") === "liquids1");
record("chaser-filter", brandGroup("CHASER FP") === "CHASER" && brandGroup("CHASER LUX") === "CHASER" && brandGroup("CHASER") === "CHASER" && brandGroup("HQD") === "HQD");

const tiers = calculateOrderPricing([
  { quantity: 2, price: 10, category: "liquids" },
  { quantity: 2, price: 10, category: "liquids1" },
], { liquids: { 2: 5 }, liquids1: { 2: 8 } });
record("liquids1-separate", tiers.subtotal === 40 && tiers.discount === 14 && tiers.ambiguous === false, JSON.stringify(tiers));

const flat = calculateOrderPricing([
  { quantity: 2, price: 10, category: "liquids" },
  { quantity: 2, price: 10, category: "liquids1" },
], { 2: 5 });
record("flat-rules-blocked", flat.discount === 0 && flat.ambiguous === true);
record("checkout-blocked", priceOrder([{ quantity: 1, price: 10, category: "liquids" }], { 2: 5 }, "", {}, []).ok === false);

const badPrice = normalizeProducts({ headers, rows: [["a", "А", "Мята", "ELFIN", "x", "1", "TRUE"]] });
record("bad-price", badPrice.issues.some((item) => item.code === "BAD_PRICE"));

const prices = normalizePrices({
  headers: ["city", "qty_from", "qty_to", "price"],
  rows: [["FFM", "1", "2", "9"], ["HH", "1", "2", "8"], ["HH", "2", "4", "7"]],
});
record("foreign-price", prices.issues.some((item) => item.code === "FOREIGN_CITY") && prices.confirmed === false);
record("price-overlap", prices.issues.some((item) => item.code === "OVERLAP"));

const couriers = normalizeCouriers({
  headers: ["courier_id", "name", "tg_id", "active", "time_from", "time_to"],
  rows: [
    ["c1", "Север", "100", "TRUE", "12:00", "18:00"],
    ["c1", "Дубль", "101", "TRUE", "12:00", "18:00"],
    ["c2", "Тихий", "100", "FALSE", "18:00", "23:00"],
    ["c3", "Ночь", "102", "TRUE", "25:00", "26:00"],
  ],
});
record("courier-checks", couriers.issues.some((item) => item.code === "DUPLICATE_COURIER") && couriers.issues.some((item) => item.code === "DUPLICATE_TG") && couriers.issues.some((item) => item.code === "BAD_TIME"));
record("active-only", couriers.couriers.every((item) => item.active) && couriers.couriers.some((item) => item.courier_id === "c2") === false);

function applyEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (process.env[key]) continue;
    process.env[key] = line.slice(index + 1).trim();
  }
}

applyEnvFile(process.env.SHEETS_ENV_FILE || "");
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH.startsWith("/") && process.env.SHEETS_ENV_DIR) {
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH = path.join(process.env.SHEETS_ENV_DIR, process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH);
}

const { app } = await import("./index.js");
const { listSheetTitles } = await import("./sheetsRead.js");

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const health = await fetch(`${base}/api/health`).then((response) => response.json());
record("health", health.city === "HH" && health.cityName === "Hamburg" && health.writes === false, JSON.stringify(health));

const auth = await fetch(`${base}/api/auth/dev`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tgId: "123456789" }),
}).then((response) => response.json());

async function get(pathname) {
  const response = await fetch(`${base}${pathname}`, { headers: { authorization: `Bearer ${auth.token}` } });
  return { status: response.status, body: await response.json() };
}

const hh = await get("/api/catalog?city=HH");
const ffm = await get("/api/catalog?city=FFM");
const mu = await get("/api/catalog?city=MU");
const couriersApi = await get("/api/couriers?city=HH");
record("hh-catalog-blocked", hh.status === 503 && hh.body.error === "SHEETS_HH_MISSING" && hh.body.products === undefined, `${hh.status} ${hh.body.error}`);
record("no-ffm", ffm.status === 400 && ffm.body.error === "INVALID_CITY");
record("no-mu", mu.status === 400 && mu.body.error === "INVALID_CITY");
record("hh-couriers-blocked", couriersApi.status === 503 && couriersApi.body.error === "SHEETS_HH_MISSING");
record("no-secret-in-error", !JSON.stringify(hh.body).includes("PRIVATE KEY") && !JSON.stringify(hh.body).includes("client_email"));

const titles = await listSheetTitles();
const expected = ["products_HH", "LiquidPrices_HH", "couriers_HH", "orders_HH", "metrics_HH"];
record("hh-tabs-absent", expected.every((name) => !titles.includes(name)), titles.join(","));

server.close();
console.log(`TOTAL ${failures.length === 0 ? "ok" : `FAIL ${failures.length}`}`);
if (failures.length) process.exit(1);

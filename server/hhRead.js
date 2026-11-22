import { hhTabReport, listSheetTitles, readTab, sheetTabs } from "./sheetsRead.js";
import { normalizeCouriers, normalizePrices, normalizeProducts } from "./hhNormalize.js";
let cache = null;

function fail(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function hasProductColumns(headers) {
  const names = headers.map((header) => header.toLowerCase());
  return ["sku", "name", "category", "brand", "price", "stock", "active"].every((name) => names.includes(name));
}

export async function readHamburgSources() {
  if (cache && cache.until > Date.now()) return cache.data;
  let titles;
  try {
    titles = await listSheetTitles();
  } catch (error) {
    if (["SHEETS_NOT_CONFIGURED", "SHEETS_AUTH_INCOMPLETE", "SHEETS_AUTH_INVALID", "SHEETS_TIMEOUT", "SHEETS_FAILED"].includes(error.code)) throw error;
    throw fail("SHEETS_FAILED", 503);
  }
  const report = hhTabReport(titles);
  if (!report.ready) throw fail("SHEETS_HH_MISSING", 503);
  const expected = sheetTabs().filter((name) => /^(products|LiquidPrices|couriers)_/.test(name));
  const primaryProducts = expected.find((name) => name.startsWith("products_"));
  const titled = await Promise.all(titles.map(async (title) => ({ title, sheet: await readTab(title) })));
  const productSheets = titled
    .filter((item) => hasProductColumns(item.sheet.headers))
    .sort((a, b) => Number(b.title === primaryProducts) - Number(a.title === primaryProducts))
    .map((item) => item.sheet);
  const pricesSheet = titled.find((item) => item.title === expected.find((name) => name.startsWith("LiquidPrices_")))?.sheet;
  const couriersSheet = titled.find((item) => item.title === expected.find((name) => name.startsWith("couriers_")))?.sheet;
  if (!productSheets.length || !pricesSheet || !couriersSheet) throw fail("SHEETS_INVALID", 422);
  const products = normalizeProducts(productSheets[0]);
  const prices = normalizePrices(pricesSheet);
  const couriers = normalizeCouriers(couriersSheet);
  if (products.issues.some((item) => item.code === "MISSING_COLUMN")) throw fail("SHEETS_INVALID", 422);
  const seen = new Set();
  const kept = [];
  for (const [index, sheet] of productSheets.entries()) {
    const parsed = index === 0 ? products : normalizeProducts(sheet);
    if (parsed.issues.some((item) => item.code === "MISSING_COLUMN")) continue;
    const rejected = new Set(parsed.issues.filter((item) => item.level === "error" && item.sku).map((item) => item.sku));
    for (const item of parsed.products) {
      if (!item.active || !item.sku || seen.has(item.sku) || rejected.has(item.sku)) continue;
      kept.push(item);
      seen.add(item.sku);
    }
  }
  const rejectedCourier = new Set(couriers.issues.filter((item) => item.courierId).map((item) => item.courierId));
  const keptCouriers = couriers.couriers.filter((item) => item.courier_id && !rejectedCourier.has(item.courier_id));
  const issueCounts = {};
  for (const item of couriers.issues) issueCounts[item.code] = (issueCounts[item.code] || 0) + 1;
  const requiredCourierColumns = ["courier_id", "name", "tg_id", "active", "time_from", "time_to"];
  const courierHeaders = couriersSheet.headers.map((header) => header.toLowerCase());
  const activeIndex = courierHeaders.indexOf("active");
  const inactive = activeIndex < 0 ? 0 : couriersSheet.rows.filter((row) => ["false", "0", "no", "n", "нет"].includes(String(row[activeIndex] ?? "").trim().toLowerCase())).length;
  const data = {
    products: kept,
    prices,
    couriers: keptCouriers,
    courierSheet: {
      tab: expected.find((name) => name.startsWith("couriers_")) || "couriers",
      rows: couriersSheet.rows.length,
      kept: keptCouriers.length,
      inactive,
      missingColumns: requiredCourierColumns.filter((name) => !courierHeaders.includes(name)),
      issues: issueCounts,
    },
    tabReport: report,
  };
  cache = { until: Date.now() + 30_000, data };
  return data;
}

export function clearHamburgCache() {
  cache = null;
}

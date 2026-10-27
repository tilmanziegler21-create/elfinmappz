import { hhTabReport, listSheetTitles, readTab, sheetTabs } from "./sheetsRead.js";
import { normalizeCouriers, normalizePrices, normalizeProducts } from "./hhNormalize.js";
let cache = null;

function fail(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
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
  const [productsSheet, pricesSheet, couriersSheet] = await Promise.all(expected.map((title) => readTab(title)));
  const products = normalizeProducts(productsSheet);
  const prices = normalizePrices(pricesSheet);
  const couriers = normalizeCouriers(couriersSheet);
  if (products.issues.some((item) => item.code === "MISSING_COLUMN")) throw fail("SHEETS_INVALID", 422);
  const rejectedSku = new Set(products.issues.filter((item) => item.level === "error" && item.sku).map((item) => item.sku));
  const rejectedCourier = new Set(couriers.issues.filter((item) => item.courierId).map((item) => item.courierId));
  const data = {
    products: products.products.filter((item) => item.active && item.sku && !rejectedSku.has(item.sku)),
    prices,
    couriers: couriers.couriers.filter((item) => item.courier_id && !rejectedCourier.has(item.courier_id)),
    tabReport: report,
  };
  cache = { until: Date.now() + 30_000, data };
  return data;
}

export function clearHamburgCache() {
  cache = null;
}

import { hhTabReport, listSheetTitles, readTab } from "./sheetsRead.js";
import { normalizeCouriers, normalizePrices, normalizeProducts } from "./hhNormalize.js";

const EXPECTED = ["products_HH", "LiquidPrices_HH", "couriers_HH"];
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
    if (error.code === "SHEETS_NOT_CONFIGURED") throw error;
    throw fail(error.code === "SHEETS_TIMEOUT" ? "SHEETS_TIMEOUT" : "SHEETS_ERROR", error.code === "SHEETS_TIMEOUT" ? 504 : 503);
  }
  const report = hhTabReport(titles);
  if (!report.ready) throw fail("SHEETS_HH_MISSING", 503);
  const [productsSheet, pricesSheet, couriersSheet] = await Promise.all(EXPECTED.map((title) => readTab(title)));
  const products = normalizeProducts(productsSheet);
  const prices = normalizePrices(pricesSheet);
  const couriers = normalizeCouriers(couriersSheet);
  if (products.issues.some((item) => item.level === "error") || couriers.issues.some((item) => item.level === "error")) {
    throw fail("SHEETS_INVALID", 422);
  }
  const data = {
    products: products.products.filter((item) => item.active),
    prices,
    couriers: couriers.couriers,
    tabReport: report,
  };
  cache = { until: Date.now() + 30_000, data };
  return data;
}

export function clearHamburgCache() {
  cache = null;
}

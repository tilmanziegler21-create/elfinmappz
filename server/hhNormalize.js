const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function cell(row, headers, name) {
  const index = headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

function bool(value) {
  const text = value.toLowerCase();
  if (["true", "1", "yes", "y", "да"].includes(text)) return true;
  if (["false", "0", "no", "n", "нет"].includes(text)) return false;
  return null;
}

function number(value) {
  if (value === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeProducts({ headers, rows }) {
  const required = ["sku", "name", "category", "brand", "price", "stock", "active"];
  const missing = required.filter((name) => !headers.some((header) => header.toLowerCase() === name));
  const issues = missing.map((name) => ({ level: "error", code: "MISSING_COLUMN", field: name }));
  const products = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const sku = cell(row, headers, "sku");
    const name = cell(row, headers, "name");
    if (!sku && !name) return;
    const price = number(cell(row, headers, "price"));
    const stock = number(cell(row, headers, "stock"));
    const active = bool(cell(row, headers, "active"));
    const category = cell(row, headers, "category");
    if (!sku) issues.push({ level: "error", code: "EMPTY_SKU", row: index + 2 });
    if (sku && seen.has(sku)) issues.push({ level: "error", code: "DUPLICATE_SKU", sku });
    if (sku) seen.add(sku);
    if (price === null || price < 0) issues.push({ level: "error", code: "BAD_PRICE", sku });
    if (stock === null || stock < 0 || !Number.isInteger(stock)) issues.push({ level: "error", code: "BAD_STOCK", sku });
    if (active === null) issues.push({ level: "error", code: "BAD_ACTIVE", sku });
    products.push({
      id: sku,
      sku,
      name,
      flavor: name,
      category,
      brand: cell(row, headers, "brand"),
      price: price ?? 0,
      stock: stock ?? 0,
      active: active === true,
      image: cell(row, headers, "image"),
    });
  });
  return { products, issues };
}

export function normalizePrices({ headers, rows }) {
  const issues = [];
  const rules = [];
  rows.forEach((row) => {
    const city = cell(row, headers, "city");
    if (city && city.toUpperCase() !== "HH") {
      issues.push({ level: "error", code: "FOREIGN_CITY", city });
      return;
    }
    const qtyFrom = number(cell(row, headers, "qty_from"));
    const qtyToRaw = cell(row, headers, "qty_to");
    const qtyTo = qtyToRaw === "" || qtyToRaw === "+" ? null : number(qtyToRaw);
    const price = number(cell(row, headers, "price"));
    if (qtyFrom === null || price === null || (qtyToRaw !== "" && qtyToRaw !== "+" && qtyTo === null)) {
      issues.push({ level: "error", code: "BAD_PRICE_RULE" });
      return;
    }
    rules.push({ city: "HH", qtyFrom, qtyTo, price });
  });
  const sorted = [...rules].sort((a, b) => a.qtyFrom - b.qtyFrom);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    if (previous.qtyTo === null || sorted[i].qtyFrom <= previous.qtyTo) {
      issues.push({ level: "error", code: "OVERLAP" });
    } else if (sorted[i].qtyFrom > previous.qtyTo + 1) {
      issues.push({ level: "warning", code: "GAP" });
    }
  }
  const confirmed = issues.every((item) => item.level !== "error") && rules.length > 0;
  return { rules, issues, confirmed };
}

export function normalizeCouriers({ headers, rows }) {
  const issues = [];
  const couriers = [];
  const ids = new Set();
  const telegrams = new Set();
  rows.forEach((row, index) => {
    const courierId = cell(row, headers, "courier_id");
    const tgId = cell(row, headers, "tg_id");
    const active = bool(cell(row, headers, "active"));
    const timeFrom = cell(row, headers, "time_from");
    const timeTo = cell(row, headers, "time_to");
    if (!courierId && !cell(row, headers, "name")) return;
    if (!courierId) issues.push({ level: "error", code: "EMPTY_COURIER", row: index + 2 });
    if (courierId && ids.has(courierId)) issues.push({ level: "error", code: "DUPLICATE_COURIER", courierId });
    if (courierId) ids.add(courierId);
    if (tgId && telegrams.has(tgId)) issues.push({ level: "error", code: "DUPLICATE_TG", tgId });
    if (tgId) telegrams.add(tgId);
    if (active === null) issues.push({ level: "error", code: "BAD_ACTIVE", courierId });
    if (!TIME.test(timeFrom) || !TIME.test(timeTo) || timeFrom >= timeTo) issues.push({ level: "error", code: "BAD_TIME", courierId });
    couriers.push({
      courier_id: courierId,
      name: cell(row, headers, "name"),
      tg_id: tgId,
      active: active === true,
      time_from: timeFrom,
      time_to: timeTo,
    });
  });
  return { couriers: couriers.filter((item) => item.active), issues };
}

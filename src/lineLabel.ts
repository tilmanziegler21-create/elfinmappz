import { catalogIdentity, lineTitle } from "./catalogLine";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function same(left: string, right: string) {
  return clean(left).localeCompare(clean(right), "ru", { sensitivity: "accent" }) === 0;
}

export function formatLine(item: { brand?: string; name?: string; variant?: string; quantity?: number; qty?: number }) {
  const rawBrand = clean(item?.brand);
  const brand = rawBrand ? catalogIdentity(rawBrand).title : "";
  const rawName = clean(item?.name);
  const variant = clean(item?.variant);
  const qty = Number(item?.quantity ?? item?.qty ?? 1);
  const count = Number.isFinite(qty) && qty > 0 ? qty : 1;
  let flavor = rawName;
  if (brand && same(flavor, brand)) flavor = "";
  if (brand && flavor.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
    flavor = flavor.slice(brand.length).replace(/^[\s—\-–:·/]+/, "");
  }
  const blob = `${brand} ${flavor} ${rawName}`.toLowerCase();
  const extra = variant && !same(variant, flavor) && !same(variant, rawName) && !same(variant, brand) && !blob.includes(variant.toLowerCase())
    ? variant
    : "";
  const head = [brand, flavor].filter(Boolean).join(" — ") || rawName || "Товар";
  const title = extra ? `${head} — ${extra}` : head;
  return { title, qty: count, text: `${title} × ${count}` };
}

export function cartTitle(product: { brand?: string; name?: string; flavor?: string; productLine?: string }, variant: { label?: string }) {
  const label = clean(variant?.label);
  const volume = /^\d+\s*мл$/i.test(label);
  const flavor = volume ? clean(product?.flavor) || label : label;
  return formatLine({ brand: lineTitle(product), name: flavor, variant: volume ? label : "" }).title;
}

export function customerHandle(username?: string) {
  const name = clean(username).replace(/^@/, "");
  if (/^[A-Za-z0-9_]{5,32}$/.test(name) && /[A-Za-z_]/.test(name)) return `@${name}`;
  return "Без username";
}

export function orderNumber(order: { displayNumber?: number | null; display_number?: number | null; orderId?: string; id?: string }) {
  const n = Number(order?.display_number ?? order?.displayNumber);
  if (Number.isInteger(n) && n >= 1001) return `#${n}`;
  return clean(order?.id || order?.orderId) || "—";
}

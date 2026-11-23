import { sectionLabel } from "./categoryRules";
import { mediaFor } from "./productMedia";
import { bundleOffer } from "./setBundle";

export type Availability = "in" | "low" | "out";

export type Variant = {
  id: string;
  label: string;
  price: number;
  oldPrice?: number;
  availability: Availability;
  stock: number;
};

export type Product = {
  id: string;
  name: string;
  flavor: string;
  brand?: string;
  productLine?: string;
  category: string;
  price: number;
  oldPrice?: number;
  availability: Availability;
  featured: boolean;
  preview?: boolean;
  description: string;
  variants: Variant[];
  catalogImage?: string;
  heroImage?: string;
};

export const products: Product[] = [
  {
    id: "elfliq-watermelon",
    name: "ELFLIQ",
    flavor: "Арбуз",
    brand: "ELFLIQ",
    category: "liquids",
    price: 9.9,
    availability: "in",
    featured: true,
    description: "30 мл. Объём выбирается на карточке.",
    catalogImage: "/products/elfliq-watermelon.png",
    heroImage: "/products/elfliq-watermelon.png",
    variants: [
      { id: "30", label: "30 мл", price: 9.9, availability: "in", stock: 6 },
    ],
  },
  {
    id: "chaser-lux-turbo-mint",
    name: "CHASER LUX",
    flavor: "Turbo Mint",
    brand: "CHASER LUX",
    category: "liquids1",
    price: 0,
    availability: "out",
    featured: false,
    preview: true,
    description: "",
    catalogImage: mediaFor("chaser-lux-turbo-mint")?.image,
    heroImage: mediaFor("chaser-lux-turbo-mint")?.image,
    variants: [
      { id: "pack", label: "—", price: 0, availability: "out", stock: 0 },
    ],
  },
  {
    id: "chaser-fp-cherry",
    name: "CHASER FP",
    flavor: "Вишня",
    brand: "CHASER FP",
    category: "liquids1",
    price: 0,
    availability: "out",
    featured: false,
    preview: true,
    description: "",
    catalogImage: mediaFor("chaser-fp-cherry")?.image,
    heroImage: mediaFor("chaser-fp-cherry")?.image,
    variants: [
      { id: "pack", label: "—", price: 0, availability: "out", stock: 0 },
    ],
  },
  {
    id: "hqd-grapey",
    name: "HQD",
    flavor: "Grapey",
    brand: "HQD",
    category: "liquids",
    price: 0,
    availability: "out",
    featured: false,
    preview: true,
    description: "",
    catalogImage: mediaFor("hqd-grapey")?.image,
    heroImage: mediaFor("hqd-grapey")?.image,
    variants: [
      { id: "30", label: "30 мл", price: 0, availability: "out", stock: 0 },
    ],
  },
  {
    id: "vozol-strawberry-ice",
    name: "VOZOL",
    flavor: "Strawberry Ice",
    brand: "VOZOL",
    category: "liquids",
    price: 0,
    availability: "out",
    featured: false,
    preview: true,
    description: "",
    catalogImage: mediaFor("vozol-strawberry-ice")?.image,
    heroImage: mediaFor("vozol-strawberry-ice")?.image,
    variants: [
      { id: "pack", label: "—", price: 0, availability: "out", stock: 0 },
    ],
  },
  {
    id: "xros-5-mini",
    name: "XROS 5 MINI",
    flavor: "VAPORESSO",
    category: "POD",
    price: 0,
    availability: "out",
    featured: false,
    preview: true,
    description: "",
    catalogImage: mediaFor("xros-5-mini")?.image,
    heroImage: mediaFor("xros-5-mini")?.image,
    variants: [
      { id: "pack", label: "—", price: 0, availability: "out", stock: 0 },
    ],
  },
  {
    id: "north",
    name: "Северный",
    flavor: "Ледяная мята",
    category: "Мята",
    price: 9.9,
    oldPrice: 12.5,
    availability: "in",
    featured: true,
    description: "Холодный мятный профиль. На карточке можно выбрать объём.",
    variants: [
      { id: "10", label: "10 мл", price: 9.9, oldPrice: 12.5, availability: "in", stock: 8 },
      { id: "30", label: "30 мл", price: 16.5, availability: "low", stock: 2 },
      { id: "50", label: "50 мл", price: 24, availability: "out", stock: 0 },
    ],
  },
  {
    id: "clear",
    name: "Ясный",
    flavor: "Белая ягода",
    category: "Ягода",
    price: 8.5,
    availability: "in",
    featured: true,
    description: "Светлый ягодный профиль без дополнительных акцентов.",
    variants: [
      { id: "10", label: "10 мл", price: 8.5, availability: "in", stock: 6 },
      { id: "30", label: "30 мл", price: 14, availability: "out", stock: 0 },
    ],
  },
  {
    id: "quiet",
    name: "Тихий",
    flavor: "Холодный лес",
    category: "Холод",
    price: 10,
    oldPrice: 11.5,
    availability: "low",
    featured: false,
    description: "Сдержанный холодный профиль. Остаток небольшой.",
    variants: [
      { id: "10", label: "10 мл", price: 10, oldPrice: 11.5, availability: "low", stock: 3 },
    ],
  },
  {
    id: "snow",
    name: "Первый снег",
    flavor: "Мята и лёд",
    category: "Мята",
    price: 9.5,
    availability: "out",
    featured: false,
    description: "Мятный профиль. Сейчас нет ни одного объёма.",
    variants: [
      { id: "10", label: "10 мл", price: 9.5, availability: "out", stock: 0 },
      { id: "30", label: "30 мл", price: 15, availability: "out", stock: 0 },
    ],
  },
  {
    id: "sapphire",
    name: "Сапфир",
    flavor: "Тёмная ягода",
    category: "Ягода",
    price: 11,
    availability: "in",
    featured: false,
    description: "Плотный ягодный профиль в двух объёмах.",
    variants: [
      { id: "10", label: "10 мл", price: 11, availability: "in", stock: 5 },
      { id: "30", label: "30 мл", price: 19, oldPrice: 21, availability: "in", stock: 4 },
    ],
  },
  {
    id: "frost",
    name: "Иней",
    flavor: "Чистый холод",
    category: "Холод",
    price: 8.9,
    availability: "in",
    featured: false,
    description: "Чистый холодный профиль, один объём.",
    variants: [
      { id: "10", label: "10 мл", price: 8.9, availability: "in", stock: 7 },
    ],
  },
];

export const categories = ["Все", ...new Set(products.map((item) => sectionLabel(item.category)))];

export function euro(value: number, locale = "de-DE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
}

export const availabilityLabel: Record<Availability, string> = {
  in: "В наличии",
  low: "Мало",
  out: "Нет",
};

export function stockLine(t: (key: string) => string, availability: string, count: number) {
  if (availability === "out" || count <= 0) return t("stock.out");
  return `${t(`stock.${availability}`)} · ${count}`;
}

let sheetCatalog: Product[] = [];
let shelfOn = false;

const shelfPrices = {
  liquids: { 1: 18, 2: 16, 3: 14 },
  liquids1: { 1: 20, 2: 18, 3: 17, 5: 15 },
} as const;

export function setSheetCatalog(items: Product[]) {
  sheetCatalog = items;
}

export function setShelfPrices(on: boolean) {
  shelfOn = on;
}

function priceBucket(category: string) {
  const value = category.trim().toLowerCase();
  if (value === "liquids" || value === "liquids1") return value;
  return "";
}

export function tierUnit(category: string, quantity: number) {
  const bucket = priceBucket(category);
  if (!shelfOn || !bucket || quantity <= 0) return null;
  const table = shelfPrices[bucket];
  let unit: number | null = null;
  for (const [key, price] of Object.entries(table)) {
    if (quantity >= Number(key)) unit = price;
  }
  return unit;
}

export function lineUnit(category: string, rowPrice: number, quantity: number) {
  const tier = tierUnit(category, quantity);
  if (tier == null) return rowPrice;
  return Math.min(rowPrice, tier);
}

export type QuantityStep = {
  qty: number;
  total: number;
  full: number;
  save: number;
  percent: number;
  talk: boolean;
};

export function quantityOffer(category: string) {
  const bucket = priceBucket(category);
  if (!shelfOn || !bucket) return null;
  const base = shelfPrices[bucket][1];
  const marks = bucket === "liquids1" ? [1, 2, 3, 5] : [1, 2, 3];
  const steps: QuantityStep[] = marks.map((qty) => {
    const unit = tierUnit(category, qty) ?? base;
    const total = unit * qty;
    const full = base * qty;
    const save = Math.max(0, full - total);
    return { qty, total, full, save, percent: save > 0 ? Math.round((save / full) * 100) : 0, talk: false };
  });
  if (bucket === "liquids") steps.push({ qty: 5, total: 0, full: 0, save: 0, percent: 0, talk: true });
  return { base, steps };
}

export function findProduct(id: string) {
  return sheetCatalog.find((item) => item.id === id) ?? products.find((item) => item.id === id) ?? null;
}

export function defaultVariant(product: Product) {
  return product.variants.find((item) => item.availability !== "out" && item.stock > 0) ?? null;
}

export function lineKey(productId: string, variantId: string) {
  return `${productId}:${variantId}`;
}

export function unitsFor(cart: Record<string, number>, productId: string) {
  const prefix = `${productId}:`;
  return Object.entries(cart).reduce((sum, [key, qty]) => (key.startsWith(prefix) ? sum + qty : sum), 0);
}

export const CART_KEY = "elfin-cart";

export function resolveCartKey(key: string) {
  const parts = key.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const product = findProduct(parts[0]);
  const variant = product?.variants.find((item) => item.id === parts[1]) ?? null;
  if (!product || !variant) return null;
  return { product, variant };
}

export function clampLineQty(key: string, qty: number) {
  const line = resolveCartKey(key);
  if (!line || line.variant.availability === "out" || line.variant.stock <= 0) return null;
  if (!Number.isFinite(qty)) return null;
  return Math.min(line.variant.stock, Math.max(1, Math.floor(qty)));
}

export function cartEntries(cart: Record<string, number>) {
  return Object.entries(cart).flatMap(([key, qty]) => {
    const line = resolveCartKey(key);
    if (!line || qty < 1) return [];
    return [{ key, qty, ...line, sku: line.product.id, category: line.product.category, total: line.variant.price * qty }];
  });
}

export function priceCart(cart: Record<string, number>) {
  const entries = cartEntries(cart);
  const counts = { liquids: 0, liquids1: 0 };
  for (const line of entries) {
    const bucket = priceBucket(line.product.category);
    if (bucket) counts[bucket] += line.qty;
  }
  let cents = 0;
  const lines = entries.map((line) => {
    const bucket = priceBucket(line.product.category);
    const unitPrice = bucket ? lineUnit(line.product.category, line.variant.price, counts[bucket]) : line.variant.price;
    cents += Math.round(unitPrice * 100) * line.qty;
    return { ...line, unitPrice, total: (Math.round(unitPrice * 100) * line.qty) / 100 };
  });
  const priced = { lines, total: cents / 100 };
  const bundle = bundleOffer(cart);
  if (!bundle) return priced;
  const extraCents = lines.reduce((sum, line) => sum + (bundle.lines[line.key] ? 0 : Math.round(line.total * 100)), 0);
  return { lines, total: (Math.round(bundle.price * 100) + extraCents) / 100 };
}

export function cartMoney(cart: Record<string, number>) {
  return priceCart(cart).total;
}

export function sanitizeCart(value: unknown): { cart: Record<string, number>; dropped: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { cart: {}, dropped: true };
  const cart: Record<string, number> = {};
  let dropped = false;
  for (const [key, raw] of Object.entries(value)) {
    const qty = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
    const next = clampLineQty(key, qty);
    if (!next || next !== raw) dropped = true;
    if (next) cart[key] = next;
  }
  return { cart, dropped };
}

export function readLooseCart(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const cart: Record<string, number> = {};
    for (const [key, rawQty] of Object.entries(value)) {
      const qty = typeof rawQty === "number" && Number.isFinite(rawQty) ? Math.floor(rawQty) : 0;
      const parts = key.split(":");
      if (qty < 1 || parts.length !== 2 || !parts[0] || !parts[1]) continue;
      cart[key] = qty;
    }
    return cart;
  } catch {
    return {};
  }
}

export function readStoredCart(): { cart: Record<string, number>; dropped: boolean } {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { cart: {}, dropped: false };
    return sanitizeCart(JSON.parse(raw));
  } catch {
    return { cart: {}, dropped: true };
  }
}

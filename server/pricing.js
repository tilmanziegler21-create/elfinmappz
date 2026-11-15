import { priceCategory } from "./categoryRules.js";

function numericTiers(prices) {
  return Object.entries(prices || {})
    .map(([key, value]) => ({ qty: Number(key), price: Number(value) }))
    .filter((entry) => Number.isFinite(entry.qty) && entry.qty > 0 && Number.isFinite(entry.price) && entry.price > 0)
    .sort((a, b) => a.qty - b.qty);
}

function splitRules(liquidPrices) {
  if (!liquidPrices || typeof liquidPrices !== "object" || Array.isArray(liquidPrices)) {
    return { liquids: null, liquids1: null, ambiguous: false };
  }
  const keys = Object.keys(liquidPrices);
  if (keys.length === 0) return { liquids: null, liquids1: null, ambiguous: false };
  if (!keys.every((key) => key === "liquids" || key === "liquids1")) {
    return { liquids: null, liquids1: null, ambiguous: true };
  }
  return {
    liquids: liquidPrices.liquids || null,
    liquids1: liquidPrices.liquids1 || null,
    ambiguous: false,
  };
}

function unitPriceAtQuantity(quantity, prices) {
  const tiers = numericTiers(prices);
  if (!tiers.length || quantity <= 0) return 0;
  let unitPrice = tiers[0].price;
  for (const tier of tiers) {
    if (quantity >= tier.qty) unitPrice = tier.price;
  }
  return unitPrice;
}

export function liquidTierMap(rules) {
  const liquids = {};
  for (const rule of rules || []) {
    const qty = Number(rule?.qtyFrom);
    const price = Number(rule?.price);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;
    liquids[qty] = price;
  }
  return Object.keys(liquids).length ? { liquids } : null;
}

export function calculateOrderPricing(items, liquidPrices) {
  const rules = splitRules(liquidPrices);
  let subtotal = 0;
  const buckets = {
    liquids: { qty: 0, base: 0 },
    liquids1: { qty: 0, base: 0 },
  };
  for (const item of items) {
    const line = Number(item.quantity) * Number(item.price);
    subtotal += line;
    const group = priceCategory(item.category);
    if (!group) continue;
    buckets[group].qty += Number(item.quantity);
    buckets[group].base += line;
  }
  let discount = 0;
  if (!rules.ambiguous) {
    for (const group of ["liquids", "liquids1"]) {
      const table = rules[group];
      const bucket = buckets[group];
      const tiers = numericTiers(table);
      if (!tiers.length || bucket.qty <= 0) continue;
      const total = Math.round(bucket.qty * unitPriceAtQuantity(bucket.qty, table) * 100) / 100;
      discount += Math.max(0, bucket.base - total);
    }
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    ambiguous: rules.ambiguous,
  };
}

export function evaluatePromo(promo, amount, promos) {
  const code = String(promo || "").trim();
  if (!code) return { valid: true, discount: 0, code: "" };
  const found = promos.find((item) => String(item.id) === code);
  if (!found) return { valid: false, discount: 0, message: "Промокод не найден" };
  if (!found.active) return { valid: false, discount: 0, message: "Промокод неактивен" };
  const now = Date.now();
  if ((found.startsAt && Date.parse(found.startsAt) > now) || (found.endsAt && Date.parse(found.endsAt) < now)) {
    return { valid: false, discount: 0, message: "Срок действия промокода истёк" };
  }
  const base = Math.max(0, Number(amount || 0));
  if (base < Number(found.minTotal || 0)) {
    return { valid: false, discount: 0, message: `Минимальная сумма для промокода: ${found.minTotal}` };
  }
  const type = String(found.type || "").toLowerCase();
  let discount = 0;
  if (type === "percent") discount = (base * Number(found.value || 0)) / 100;
  else if (type === "fixed" || type === "amount") discount = Number(found.value || 0);
  else return { valid: false, discount: 0, message: "Неподдерживаемый тип промокода" };
  discount = Math.min(base, Math.round(Math.max(0, discount) * 100) / 100);
  if (discount <= 0) return { valid: false, discount: 0, message: "Промокод не даёт скидку" };
  return { valid: true, discount, code };
}

export function priceOrder(items, liquidPrices, promoCode, user, promos) {
  const base = calculateOrderPricing(items, liquidPrices);
  if (base.ambiguous) return { ok: false, error: "PRICE_RULES_AMBIGUOUS" };
  let discount = base.discount;
  let amount = Math.max(0, base.subtotal - discount);
  const promo = evaluatePromo(promoCode, amount, promos);
  if (!promo.valid) return { ok: false, error: promo.message || "INVALID_PROMO" };
  discount += promo.discount;
  amount = Math.max(0, amount - promo.discount);
  const level = Number(user?.level_percent || 0);
  if (level > 0) {
    const levelDiscount = Math.round(amount * level) / 100;
    discount += levelDiscount;
    amount = Math.max(0, amount - levelDiscount);
  }
  let usedDeferred = 0;
  const deferred = Number(user?.deferred_discount || 0);
  if (deferred > 0 && amount > 0) {
    usedDeferred = Math.min(amount, Math.round(deferred * 100) / 100);
    discount += usedDeferred;
    amount = Math.max(0, amount - usedDeferred);
  }
  return {
    ok: true,
    subtotal: base.subtotal,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(amount * 100) / 100,
    promo: promo.code || "",
    usedDeferred,
  };
}

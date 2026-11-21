export const setRecipes = {
  "SET-1": { liquid: 1, cartridge: 2, device: 0 },
  "SET-2": { liquid: 2, cartridge: 4, device: 0 },
  "SET-3": { liquid: 2, cartridge: 0, device: 1 },
  "SET-4": { liquid: 2, cartridge: 2, device: 1 },
  "SET-5": { liquid: 4, cartridge: 0, device: 1 },
  "SET-6": { liquid: 4, cartridge: 4, device: 1 },
};

export function setRecipe(sku) {
  return setRecipes[String(sku || "")] || null;
}

export function partKind(product) {
  const category = String(product?.category || "").trim().toLowerCase();
  const brand = String(product?.brand || "").trim().toUpperCase();
  if (!category || category === "sets") return "";
  if (category === "cartridge" || brand.includes("CARTRIDGE")) return "cartridge";
  if (category === "liquids" && (brand === "ELFLIQ" || brand.startsWith("ELFLIQ "))) return "liquid";
  if (category === "electronics" || category === "devices" || category === "device" || category === "pod" || category === "pods") return "device";
  return "";
}

function pool(products, kind, freeOf) {
  return products
    .filter((item) => partKind(item) === kind && item.active !== false && item.sku)
    .map((item) => ({ sku: String(item.sku), free: Math.max(0, Number(freeOf(item.sku)) || 0) }))
    .filter((item) => item.free > 0)
    .sort((a, b) => b.free - a.free || a.sku.localeCompare(b.sku));
}

export function allocateSet(sku, qty, products, freeOf) {
  const recipe = setRecipe(sku);
  const count = Number(qty);
  if (!recipe || !Number.isInteger(count) || count < 1) return { ok: false, lines: [] };
  const lines = [];
  for (const kind of ["liquid", "cartridge", "device"]) {
    let left = (recipe[kind] || 0) * count;
    if (!left) continue;
    for (const item of pool(products, kind, freeOf)) {
      if (!left) break;
      const take = Math.min(item.free, left);
      lines.push({ sku: item.sku, qty: take });
      left -= take;
    }
    if (left > 0) return { ok: false, lines: [] };
  }
  return { ok: true, lines };
}

export function setAvailable(sku, products, freeOf) {
  const recipe = setRecipe(sku);
  if (!recipe) return 0;
  let count = Infinity;
  for (const kind of ["liquid", "cartridge", "device"]) {
    const each = recipe[kind] || 0;
    if (!each) continue;
    const total = pool(products, kind, freeOf).reduce((sum, item) => sum + item.free, 0);
    count = Math.min(count, Math.floor(total / each));
  }
  return Number.isFinite(count) ? count : 0;
}

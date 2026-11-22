export function priceCategory(category: string) {
  const value = category.trim().toLowerCase();
  if (value === "liquids" || value === "liquids1") return value;
  return "";
}

export function sectionLabel(category: string) {
  if (priceCategory(category)) return "Жидкости";
  if (String(category || "").trim().toLowerCase() === "sets") return "Наборы";
  return category;
}

export function isDisposableCategory(category: string) {
  const value = category.trim().toLowerCase();
  return value === "electronics" || value === "device" || value === "devices";
}

export function isPodCategory(category: string) {
  if (isDisposableCategory(category)) return false;
  const value = category.trim().toLowerCase();
  return value === "pod" || value === "pods";
}

export function shopSection(category: string) {
  if (priceCategory(category)) return "Жидкости";
  const value = category.trim().toLowerCase();
  if (value === "sets") return "Наборы";
  if (isPodCategory(category)) return "POD";
  if (isDisposableCategory(category)) return "Устройства";
  return "";
}

export function brandGroup(brand: string) {
  const value = brand.trim().toUpperCase().replace(/\s+/g, " ");
  if (value === "HQD" || value === "ELFLIQ" || value === "VOZOL" || value === "PUFFY") return value;
  if (value.startsWith("PUFFY ") || value.startsWith("PUFFY-")) return "PUFFY";
  return value === "CHASER" || value.startsWith("CHASER ") || value.startsWith("CHASER-") ? "CHASER" : "";
}

export const brandFilters = ["HQD", "ELFLIQ", "VOZOL", "CHASER", "PUFFY"] as const;

export function priceCategory(category: string) {
  const value = category.trim().toLowerCase();
  if (value === "liquids" || value === "liquids1") return value;
  return "";
}

export function sectionLabel(category: string) {
  if (priceCategory(category)) return "Жидкости";
  return category;
}

export function shopSection(category: string) {
  if (priceCategory(category)) return "Жидкости";
  const value = category.trim().toLowerCase();
  if (value === "pod" || value === "pods") return "POD";
  if (value === "electronics" || value === "devices" || value === "device") return "Устройства";
  return "";
}

export function brandGroup(brand: string) {
  const value = brand.trim().toUpperCase().replace(/\s+/g, " ");
  if (value === "HQD" || value === "ELFLIQ" || value === "VOZOL" || value === "PUFFY") return value;
  if (value.startsWith("PUFFY ") || value.startsWith("PUFFY-")) return "PUFFY";
  return value === "CHASER" || value.startsWith("CHASER ") || value.startsWith("CHASER-") ? "CHASER" : "";
}

export const brandFilters = ["HQD", "ELFLIQ", "VOZOL", "CHASER", "PUFFY"] as const;

export function priceCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  if (value === "liquids" || value === "liquids1") return value;
  return "";
}

export function sectionLabel(category) {
  if (priceCategory(category)) return "Жидкости";
  return String(category || "");
}

export function brandGroup(brand) {
  const value = String(brand || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (value === "HQD" || value === "ELFLIQ" || value === "VOZOL") return value;
  if (value === "CHASER" || value.startsWith("CHASER ") || value.startsWith("CHASER-")) return "CHASER";
  return "";
}

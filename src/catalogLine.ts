export type CatalogIdentity = {
  brand: string;
  productLine: string;
  key: string;
  title: string;
};

const singleLines = ["ELFLIQ", "VOZOL", "HQD"];

export function catalogIdentity(raw: string): CatalogIdentity {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!value) return { brand: "ELFIN", productLine: "", key: "ELFIN", title: "ELFIN" };
  for (const maker of singleLines) {
    if (value === maker || value.startsWith(`${maker} `) || value.startsWith(`${maker}-`)) {
      return { brand: maker, productLine: "", key: maker, title: maker };
    }
  }
  if (value === "CHASER" || value.startsWith("CHASER ") || value.startsWith("CHASER-")) {
    let line = value.slice("CHASER".length).replace(/^[\s-]+/, "");
    if (line === "FP" || line.startsWith("FP ") || line.startsWith("FP-")) line = `F/P${line.slice(2)}`;
    const title = line ? `CHASER ${line}` : "CHASER";
    return { brand: "CHASER", productLine: line, key: `CHASER|${line}`, title };
  }
  return { brand: value, productLine: "", key: value, title: value };
}

export function lineTitle(item: { brand?: string; productLine?: string; name?: string }) {
  const brand = String(item?.brand ?? "").trim();
  const line = String(item?.productLine ?? "").trim();
  if (brand && line) return `${brand} ${line}`.replace(/\s+/g, " ");
  return String(item?.name ?? "").trim() || brand;
}

const singleLines = ["ELFLIQ", "VOZOL", "HQD"];

export function catalogIdentity(raw) {
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

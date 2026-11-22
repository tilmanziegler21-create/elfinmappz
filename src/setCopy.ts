export function setNumberOf(item: { brand?: string; id?: string; variants?: { id: string }[] }) {
  const source = `${item.variants?.[0]?.id || ""} ${item.brand || ""} ${item.id || ""}`;
  const match = source.toUpperCase().match(/SET-(\d)/) || source.match(/№\s*(\d)/) || source.toLowerCase().match(/набор-(\d)/);
  return match?.[1] || "";
}

export function setShot(number: string, theme: "light" | "dark") {
  return `/assets/products/sets/set-${number}-${theme}.jpg`;
}

export function setDevice(theme: "light" | "dark") {
  return `/assets/products/sets/set-device-${theme}.jpg`;
}

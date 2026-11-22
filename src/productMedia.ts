import table from "../productMedia.json";
import type { ScenePreset } from "./productMotion";

export type SceneAccent = "melon" | "mint" | "cold" | "grape" | "frost" | "pod";

export type MediaEntry = {
  sku: string;
  image: string;
  imageType: "transparent" | "photo";
  scene: ScenePreset;
  accent: SceneAccent;
  category: "liquids" | "devices" | "pods" | "sets";
};

const scenes = new Set<ScenePreset>(["liquid-float", "device-float", "pod-float", "static-product"]);
const accents = new Set<SceneAccent>(["melon", "mint", "cold", "grape", "frost", "pod"]);

function valid(entry: MediaEntry | undefined): entry is MediaEntry {
  return Boolean(entry && scenes.has(entry.scene) && accents.has(entry.accent) && entry.image);
}

export function mediaFor(id: string): MediaEntry | null {
  const entry = (table as Record<string, MediaEntry>)[id];
  return valid(entry) ? entry : null;
}

export function mediaBySku(sku: string): MediaEntry | null {
  if (!sku) return null;
  const entry = Object.values(table as Record<string, MediaEntry>).find((item) => item.sku === sku);
  return valid(entry) ? entry : null;
}

const brandMedia: Array<{ test: (brand: string) => boolean; id: string }> = [
  { test: (brand) => brand === "НАБОР №1", id: "set-1" },
  { test: (brand) => brand === "НАБОР №2", id: "set-2" },
  { test: (brand) => brand === "НАБОР №3", id: "set-3" },
  { test: (brand) => brand === "НАБОР №4", id: "set-4" },
  { test: (brand) => brand === "НАБОР №5", id: "set-5" },
  { test: (brand) => brand === "НАБОР №6", id: "set-6" },
  { test: (brand) => brand === "PUFFY" || brand.startsWith("PUFFY "), id: "puffy-berry-cherry" },
  { test: (brand) => brand.startsWith("ELFLIQ"), id: "elfliq-watermelon" },
  { test: (brand) => brand.includes("SQUID"), id: "chaser-squid-game" },
  { test: (brand) => brand.includes("F/P") || brand.includes(" FP") || brand.endsWith(" FP"), id: "chaser-fp-barberry" },
  { test: (brand) => brand.includes("BLACK"), id: "chaser-black" },
  { test: (brand) => brand.includes("LIMITED EDITION") || brand.includes("SPECIAL EDITION"), id: "chaser-special" },
  { test: (brand) => brand === "CHASER LUX" || brand.startsWith("CHASER LUX "), id: "chaser-lux-turbo-mint" },
  { test: (brand) => brand.includes("CARTRIDGE") && brand.includes("XROS"), id: "pd-0013" },
  { test: (brand) => brand === "VOEX" || brand.startsWith("VOEX "), id: "voex-pepper-mint" },
  { test: (brand) => brand.startsWith("HQD"), id: "hqd-grapey" },
  { test: (brand) => brand.startsWith("VOZOL"), id: "vozol-strawberry-ice" },
  { test: (brand) => brand.includes("XROS 6"), id: "xros-6-mini" },
  { test: (brand) => brand.includes("XROS 5"), id: "xros-5-mini" },
  { test: (brand) => brand.includes("ELF BC 45000"), id: "elf-bc-45000" },
  { test: (brand) => brand.includes("VAPSOLO 80K"), id: "vapsolo-80k" },
];

export function mediaByBrand(brand: string): MediaEntry | null {
  const value = brand.trim().toUpperCase().replace(/\s+/g, " ");
  const match = brandMedia.find((item) => item.test(value));
  return match ? mediaFor(match.id) : null;
}

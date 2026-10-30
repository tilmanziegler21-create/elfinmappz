import table from "../productMedia.json";
import type { ScenePreset } from "./productMotion";

export type SceneAccent = "melon" | "mint" | "cold" | "grape" | "frost" | "pod";

export type MediaEntry = {
  sku: string;
  image: string;
  imageType: "transparent" | "photo";
  scene: ScenePreset;
  accent: SceneAccent;
  category: "liquids" | "devices" | "pods";
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

const brandMedia: Array<{ test: (brand: string) => boolean; id: string; flavors: string[] }> = [
  { test: (brand) => brand.startsWith("ELFLIQ"), id: "elfliq-watermelon", flavors: ["watermelon", "арбуз"] },
  { test: (brand) => brand.startsWith("CHASER") && (brand.includes("F/P") || brand.includes("FP")), id: "chaser-fp-cherry", flavors: ["cherry", "вишня"] },
  { test: (brand) => brand.startsWith("CHASER"), id: "chaser-lux-turbo-mint", flavors: ["turbo mint"] },
  { test: (brand) => brand.startsWith("HQD"), id: "hqd-grapey", flavors: ["grapey"] },
  { test: (brand) => brand.startsWith("VOZOL"), id: "vozol-strawberry-ice", flavors: ["strawberry", "клубник"] },
  { test: (brand) => brand.includes("XROS 5"), id: "xros-5-mini", flavors: [] },
];

export function mediaByBrand(brand: string): MediaEntry | null {
  const value = brand.trim().toUpperCase().replace(/\s+/g, " ");
  const match = brandMedia.find((item) => item.test(value));
  return match ? mediaFor(match.id) : null;
}

export function depictedMediaId(brand: string): string | null {
  const value = brand.trim().toUpperCase().replace(/\s+/g, " ");
  return brandMedia.find((item) => item.test(value))?.id ?? null;
}

export function photoMatchesFlavor(mediaId: string, flavor: string): boolean {
  const item = brandMedia.find((entry) => entry.id === mediaId);
  if (!item) return false;
  if (item.flavors.length === 0) return true;
  const value = flavor.trim().toLowerCase();
  return item.flavors.some((token) => value.includes(token));
}

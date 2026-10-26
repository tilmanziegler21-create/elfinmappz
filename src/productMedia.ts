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

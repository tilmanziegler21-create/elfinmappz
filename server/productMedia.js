import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../productMedia.json");
let table = null;

function mediaTable() {
  if (!table) table = JSON.parse(fs.readFileSync(file, "utf8"));
  return table;
}

export function mediaForSku(sku) {
  if (!sku) return null;
  return Object.values(mediaTable()).find((entry) => entry && entry.sku && entry.sku === sku) ?? null;
}

export function withMedia(product) {
  const entry = mediaForSku(product?.sku);
  if (!entry) return product;
  return {
    ...product,
    image: entry.image,
    imageType: entry.imageType,
    animationPreset: entry.scene,
  };
}

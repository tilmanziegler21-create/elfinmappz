export type ImageMode = "crystal" | "cutout" | "photo";

const SOON_LIMIT = 4;

export function imageExtension(url: string) {
  const path = url.split(/[?#]/)[0];
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function plannedMode(url?: string): ImageMode | "detect" {
  if (!url) return "crystal";
  const ext = imageExtension(url);
  if (ext === "png" || ext === "webp") return "detect";
  return "photo";
}

export function preloadPlan(urls: Array<string | undefined>, limit = SOON_LIMIT) {
  const soon: string[] = [];
  const later: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (soon.length < limit) soon.push(url);
    else later.push(url);
  }
  return { soon, later };
}

export function detectCutout(url: string) {
  if (plannedMode(url) !== "detect") return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(hasTransparentPixel(image));
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => reject(new Error("image"));
    image.src = url;
  });
}

function hasTransparentPixel(image: HTMLImageElement) {
  const width = Math.max(1, Math.min(32, image.naturalWidth || 1));
  const height = Math.max(1, Math.min(32, image.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 250) return true;
  }
  return false;
}

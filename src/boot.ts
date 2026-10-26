export const BOOT_TIMEOUT_MS = 12000;
export const WARM_KEY = "elfin-boot";

export type BootMarks = {
  telegram: boolean;
  config: boolean;
  auth: boolean;
  catalog: boolean;
  images: boolean;
};

export type BootPhase = "init" | "shop" | "vitrine" | "ready" | "error";

const weights: Array<[keyof BootMarks, number]> = [
  ["telegram", 15],
  ["config", 25],
  ["auth", 20],
  ["catalog", 25],
  ["images", 15],
];

export function bootProgress(marks: BootMarks) {
  return weights.reduce((sum, [key, weight]) => sum + (marks[key] ? weight : 0), 0);
}

export function bootPhase(marks: BootMarks, failed: boolean): BootPhase {
  if (failed) return "error";
  if (marks.telegram && marks.config && marks.auth && marks.catalog && marks.images) return "ready";
  if (!marks.telegram || !marks.config) return "init";
  if (!marks.auth) return "shop";
  return "vitrine";
}

export const bootLabel: Record<BootPhase, string> = {
  init: "Инициализация",
  shop: "Подключаем магазин",
  vitrine: "Загружаем витрину",
  ready: "Готово",
  error: "Магазин не ответил",
};

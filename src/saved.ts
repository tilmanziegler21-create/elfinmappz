import { findProduct } from "./products";

export const SAVED_KEY = "elfin-saved";
export const SAVED_EVENT = "elfin-saved";

export function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === "string" && Boolean(findProduct(id)));
  } catch {
    return [];
  }
}

export function writeSaved(ids: string[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(SAVED_EVENT));
}

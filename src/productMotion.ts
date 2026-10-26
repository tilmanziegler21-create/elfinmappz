import { ease } from "./motion";

export const productFloat = { duration: 5.5, distance: 10 };
export const productTilt = { duration: 11, angle: 3 };

export const scenePresets = {
  "liquid-float": { duration: 5.5, distance: 10, tilt: 1.5, tiltDuration: 11 },
  "device-float": { duration: 6, distance: 7, tilt: 1, tiltDuration: 12 },
  "pod-float": { duration: 6.5, distance: 6, tilt: 0.8, tiltDuration: 13 },
  "static-product": { duration: 0, distance: 0, tilt: 0, tiltDuration: 0 },
} as const;

export type ScenePreset = keyof typeof scenePresets;
export const productEntrance = { duration: 0.7, ease, y: 16 };
export const frameShift = { duration: 0.26, ease };
export const variantSheetMove = { duration: 0.38, ease };
export const addPulse = { duration: 0.4, ease };

export const productTap = { scale: 0.97 };
export const favoriteExit = { opacity: 0, scale: 0.92, transition: { duration: 0.28, ease } };
export const cartBump = { scale: [1, 1.55, 1], rotate: [0, -7, 0] };

export const navIndicator = { type: "spring" as const, stiffness: 480, damping: 36, mass: 0.6 };

export function liteMotion() {
  const connection = typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    : undefined;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
  return Boolean(connection?.saveData) || cores <= 2;
}

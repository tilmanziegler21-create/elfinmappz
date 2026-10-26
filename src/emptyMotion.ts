import { ease, tapSpring } from "./motion";

const fade = { opacity: 0, y: 8 };
const shown = { opacity: 1, y: 0 };

export const emptyFloat = { duration: 5, distance: 6 };

export const emptyTap = { ...tapSpring };

export function emptyEntrance(quick: boolean) {
  if (quick) {
    return {
      crystal: { duration: 0.22, ease },
      title: { duration: 0.22, delay: 0.04, ease },
      description: { duration: 0.22, delay: 0.08, ease },
      cta: { duration: 0.22, delay: 0.12, ease },
    };
  }
  return {
    crystal: { duration: 0.45, ease },
    title: { duration: 0.35, delay: 0.1, ease },
    description: { duration: 0.35, delay: 0.17, ease },
    cta: { duration: 0.4, delay: 0.24, ease },
  };
}

export const emptyHidden = {
  crystal: { opacity: 0, scale: 0.92 },
  text: fade,
  shown,
};

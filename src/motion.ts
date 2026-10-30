export const ease = [0.22, 1, 0.36, 1] as const;

export const tapSpring = { type: "spring" as const, stiffness: 560, damping: 24, mass: 0.5 };

export const pageMove = {
  initial: { opacity: 1, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 1, x: -10 },
  transition: { duration: 0.16, ease },
};

export const sectionList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

export const sectionItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.36, ease } },
};

export const cardList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const cardItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
};

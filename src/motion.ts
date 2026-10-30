export const ease = [0.22, 1, 0.36, 1] as const;

export const tapSpring = { type: "spring" as const, stiffness: 560, damping: 24, mass: 0.5 };

const settle = [0, 0, 0.2, 1] as const;

export const pageMove = {
  initial: { opacity: 1, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 1, y: 0, transition: { duration: 0 } },
  transition: { duration: 0.15, ease: settle },
};

export const sectionList = {
  hidden: {},
  show: { transition: { staggerChildren: 0, delayChildren: 0 } },
};

export const sectionItem = {
  hidden: { opacity: 1, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: settle } },
};

export const cardList = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

export const cardItem = {
  hidden: { opacity: 1, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: settle } },
};

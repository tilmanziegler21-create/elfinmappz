import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { addPulse, cartBump } from "./productMotion";

export function CountBump({
  value,
  className,
  label,
  onClick,
}: {
  value: number;
  className: string;
  label: string;
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const ready = useRef(false);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      return;
    }
    if (reduce) return;
    setPlay(true);
    const id = window.setTimeout(() => setPlay(false), 460);
    return () => window.clearTimeout(id);
  }, [value, reduce]);

  const motionProps = {
    className,
    "aria-label": label,
    animate: play ? cartBump : { scale: 1, rotate: 0 },
    transition: addPulse,
    whileTap: onClick && !reduce ? { scale: 0.96 } : undefined,
    onClick,
  };
  if (onClick) {
    return (
      <motion.button type="button" {...motionProps}>
        {value}
      </motion.button>
    );
  }
  return (
    <motion.span {...motionProps}>
      {value}
    </motion.span>
  );
}

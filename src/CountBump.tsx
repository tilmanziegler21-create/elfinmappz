import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { addPulse, cartBump } from "./productMotion";

export function CountBump({
  value,
  className,
  label,
}: {
  value: number;
  className: string;
  label: string;
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

  return (
    <motion.span
      className={className}
      aria-label={label}
      animate={play ? cartBump : { scale: 1, rotate: 0 }}
      transition={addPulse}
    >
      {value}
    </motion.span>
  );
}

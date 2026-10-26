import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { detectCutout, plannedMode } from "./productImage";
import type { SceneAccent } from "./productMedia";
import { frameShift, productEntrance, productFloat, productTilt, scenePresets, type ScenePreset } from "./productMotion";

function useStill() {
  const reduce = useReducedMotion();
  const [media, setMedia] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMedia(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return Boolean(reduce) || media || hidden;
}

export function ProductFloatStage({
  image,
  label,
  frameKey,
  lite,
  preset,
  accent,
  children,
}: {
  image?: string;
  label: string;
  frameKey: string;
  lite?: boolean;
  preset?: ScenePreset;
  accent?: SceneAccent;
  children: ReactNode;
}) {
  const reduce = useStill();
  const [failed, setFailed] = useState(false);
  const [detected, setDetected] = useState<boolean | null>(null);
  const plan = plannedMode(image);
  const pending = Boolean(image) && !failed && plan === "detect" && detected === null;
  const mode = !image || failed ? "crystal" : pending || plan === "photo" || detected === false ? "photo" : "cutout";
  const spec = preset ? scenePresets[preset] : null;
  const float = !reduce && preset !== "static-product" && !pending && (mode === "crystal" || mode === "cutout");
  const mist = accent === "melon" || accent === "frost";
  const drift = float && !lite && mist;
  const tilt = spec ? spec.tilt : productTilt.angle;
  const distance = spec ? spec.distance : productFloat.distance;
  const duration = spec ? spec.duration : productFloat.duration;
  const tiltDuration = spec ? spec.tiltDuration : productTilt.duration;

  useEffect(() => {
    setFailed(false);
    setDetected(null);
    if (!image || plan !== "detect") return;
    let alive = true;
    detectCutout(image).then((value) => {
      if (alive) setDetected(value);
    }).catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [image, plan]);

  return (
    <motion.div
      className="float-stage"
      data-float={float ? "true" : "false"}
      data-image={pending ? "pending" : mode}
      data-lite={lite ? "true" : "false"}
      data-scene={preset}
      data-accent={accent ?? "ice"}
      initial={reduce ? false : { opacity: 0, y: productEntrance.y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : productEntrance.duration, ease: productEntrance.ease }}
    >
      {mist ? (
        <motion.span
          className="float-mist"
          aria-hidden="true"
          animate={drift ? { x: [0, 4, 0], opacity: [0.22, 0.38, 0.22] } : { x: 0, opacity: 0.28 }}
          transition={drift ? { duration: 9, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      ) : null}
      <motion.span
        className="float-shadow"
        aria-hidden="true"
        animate={float
          ? { scaleX: spec ? [1, 0.92, 1] : [1, 0.82, 1], opacity: spec ? [0.42, 0.26, 0.42] : [0.55, 0.28, 0.55] }
          : { scaleX: 1, opacity: spec ? 0.34 : 0.4 }}
        transition={float ? { duration, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      />
      <motion.div
        className="float-bob"
        animate={float ? { y: [0, -distance, 0] } : { y: 0 }}
        transition={float ? { duration, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      >
        <motion.div
          className="float-tilt"
          animate={float ? { rotate: [0, tilt, 0, -tilt, 0] } : { rotate: 0 }}
          transition={float ? { duration: tiltDuration, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={frameKey}
              className="float-frame"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={frameShift}
            >
              {mode !== "crystal" && image ? (
                <img
                  src={image}
                  alt={label}
                  decoding="async"
                  draggable={false}
                  onError={() => setFailed(true)}
                />
              ) : (
                children
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

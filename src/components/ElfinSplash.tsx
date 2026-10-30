import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { bootLabel, type BootPhase } from "../boot";

const WORD = "ELFIN MARKET";

export function ElfinSplash({
  phase,
  progress,
  warm,
  onRetry,
  onHidden,
}: {
  phase: BootPhase;
  progress: number;
  warm: boolean;
  onRetry: () => void;
  onHidden: () => void;
}) {
  const reduce = useReducedMotion();
  const [introDone, setIntroDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shown = phase === "ready" ? 100 : Math.min(progress, 99);

  useEffect(() => {
    const wait = reduce ? 160 : warm ? 420 : 1100;
    const id = window.setTimeout(() => setIntroDone(true), wait);
    return () => window.clearTimeout(id);
  }, [reduce, warm]);

  useEffect(() => {
    if (!introDone || phase !== "ready") return;
    if (reduce) {
      onHidden();
      return;
    }
    setLeaving(true);
    const id = window.setTimeout(onHidden, 420);
    return () => window.clearTimeout(id);
  }, [introDone, phase, reduce, onHidden]);

  return (
    <div
      className={warm ? "splash is-warm" : "splash"}
      style={leaving ? { opacity: 0, transition: "opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1)" } : undefined}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "ready" && phase !== "error"}
      aria-label="Загрузка ELFIN Market"
    >
      <div className="splash-stage">
        <span className="splash-glow" aria-hidden="true" />
        <span className="splash-spark splash-spark-a" aria-hidden="true" />
        <span className="splash-spark splash-spark-b" aria-hidden="true" />
        <span className="splash-spark splash-spark-c" aria-hidden="true" />
        <span className="splash-spark splash-spark-d" aria-hidden="true" />
        <span className="splash-spark splash-spark-e" aria-hidden="true" />
        <svg className="splash-ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" />
        </svg>
        <img className="splash-face" src="/elf.jpg" alt="" />
      </div>
      <p className="splash-word" aria-hidden="true">
        {WORD.split("").map((letter, index) => (
          <span key={`${letter}-${index}`} className={letter === " " ? "splash-gap" : "splash-letter"} style={{ ["--i" as string]: index }}>
            {letter === " " ? "" : letter}
          </span>
        ))}
      </p>
      <h1 className="splash-title">ELFIN</h1>
      <p className="splash-line">Пробуждаем ледяную магию</p>
      <p className="splash-status">{bootLabel[phase]}</p>
      {phase === "error" ? (
        <button type="button" className="btn btn-primary splash-retry" onClick={onRetry}>
          Повторить
        </button>
      ) : (
        <div className="splash-meter">
          <div className="splash-track">
            <span className="splash-fill" style={{ transform: `scaleX(${shown / 100})` }} />
          </div>
          {shown > 0 ? <span className="splash-percent">{shown}%</span> : null}
        </div>
      )}
    </div>
  );
}

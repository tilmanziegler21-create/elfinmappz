import { motion, useReducedMotion } from "framer-motion";
import { CrystalIllustration, type EmptyVariant } from "./CrystalIllustration";
import { emptyEntrance, emptyHidden, emptyTap } from "./emptyMotion";

export type EmptyAction = { label: string; onClick: () => void };

export function EmptyState({
  variant,
  title,
  description,
  primaryAction,
  secondaryAction,
  size = "md",
  animated = true,
}: {
  variant: EmptyVariant;
  title: string;
  description: string;
  primaryAction?: EmptyAction;
  secondaryAction?: EmptyAction;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}) {
  const reduce = useReducedMotion();
  const play = animated && !reduce;
  const motionSet = emptyEntrance(variant === "search");
  return (
    <div className={`empty-state is-${size}`}>
      <motion.div
        className="empty-crystal"
        initial={play ? emptyHidden.crystal : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={motionSet.crystal}
      >
        <span className="empty-glow" />
        <span className="empty-float">
          <CrystalIllustration variant={variant} />
        </span>
      </motion.div>
      <motion.h2
        className="empty-title"
        initial={play ? emptyHidden.text : false}
        animate={emptyHidden.shown}
        transition={motionSet.title}
      >
        {title}
      </motion.h2>
      <motion.p
        className="empty-text"
        initial={play ? emptyHidden.text : false}
        animate={emptyHidden.shown}
        transition={motionSet.description}
      >
        {description}
      </motion.p>
      {primaryAction ? (
        <motion.div
          className="empty-actions"
          initial={play ? emptyHidden.text : false}
          animate={emptyHidden.shown}
          transition={motionSet.cta}
        >
          <motion.button
            type="button"
            className="btn btn-primary empty-cta"
            onClick={primaryAction.onClick}
            whileTap={play ? { scale: 0.97 } : undefined}
            transition={emptyTap}
          >
            {primaryAction.label}
          </motion.button>
          {secondaryAction ? (
            <button type="button" className="empty-secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}

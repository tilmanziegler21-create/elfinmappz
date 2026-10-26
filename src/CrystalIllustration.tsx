import { useId } from "react";

export type EmptyVariant =
  | "cart"
  | "orders"
  | "search"
  | "catalog"
  | "favorites"
  | "promotions"
  | "unavailable"
  | "connectionError";

export function CrystalIllustration({ variant }: { variant: EmptyVariant }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="empty-crystal-shape" viewBox="0 0 120 148" aria-hidden="true">
      <ellipse cx="60" cy="132" rx="28" ry="6" fill="rgba(18, 58, 109, 0.14)" />
      <defs>
        <linearGradient id={id} x1="16" y1="8" x2="104" y2="124" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="0.48" stopColor="#b7d7ee" stopOpacity="0.78" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M60 8 104 34v52L60 124 16 86V34z" fill={`url(#${id})`} stroke="rgba(29, 110, 200, 0.5)" strokeWidth="2" />
      <path d="M60 28 88 44v32L60 100 32 76V44z" fill="rgba(255,255,255,0.55)" stroke="rgba(29, 110, 200, 0.28)" />
      <path d="M60 28 72 70 60 100 48 70z" fill="rgba(29, 110, 200, 0.16)" />
      <g fill="none" stroke="#1d6ec8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {glyph(variant)}
      </g>
    </svg>
  );
}

function glyph(variant: EmptyVariant) {
  if (variant === "cart") {
    return <path d="M46 70h28l-2.5 14h-23zM50 70l2.2-8h15.6L70 70" />;
  }
  if (variant === "orders") {
    return (
      <>
        <rect x="44" y="60" width="32" height="24" rx="3" />
        <path d="M50 68h20M50 74h14" />
      </>
    );
  }
  if (variant === "search") {
    return (
      <>
        <circle cx="57" cy="68" r="8" />
        <path d="M63 74l8 8" />
      </>
    );
  }
  if (variant === "favorites") {
    return <path d="M60 58l3.2 7.2 7.8.8-5.8 5.2 1.6 7.8L60 75l-6.8 4 1.6-7.8-5.8-5.2 7.8-.8z" />;
  }
  if (variant === "promotions") {
    return (
      <>
        <path d="M46 78l26-22 8 8-26 22z" />
        <path d="M72 58h.01" />
      </>
    );
  }
  if (variant === "unavailable") {
    return <path d="M46 72h28" />;
  }
  if (variant === "connectionError") {
    return <path d="M48 62l8 10-8 10M72 62l-8 10 8 10" />;
  }
  return null;
}

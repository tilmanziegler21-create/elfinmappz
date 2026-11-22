const KEY = "elfin-set-bundle";

export type SetBundle = {
  offerId: string;
  price: number;
  lines: Record<string, number>;
};

export function saveSetBundle(bundle: SetBundle) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(bundle));
  } catch {
    /* private mode */
  }
}

export function readSetBundle(): SetBundle | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "") as SetBundle;
    if (!raw || typeof raw.offerId !== "string" || !Number.isFinite(Number(raw.price)) || !raw.lines || typeof raw.lines !== "object") return null;
    const lines: Record<string, number> = {};
    for (const [key, qty] of Object.entries(raw.lines)) {
      if (typeof qty === "number" && qty > 0) lines[key] = qty;
    }
    if (!Object.keys(lines).length) return null;
    return { offerId: raw.offerId, price: Number(raw.price), lines };
  } catch {
    return null;
  }
}

export function bundleOffer(cart: Record<string, number>) {
  const bundle = readSetBundle();
  if (!bundle) return null;
  const cartKeys = Object.keys(cart);
  const needKeys = Object.keys(bundle.lines);
  if (cartKeys.length !== needKeys.length) return null;
  if (!needKeys.every((key) => cart[key] === bundle.lines[key])) return null;
  return bundle;
}

export function scaleToPrice<T extends { qty: number; unitPrice: number; total: number }>(lines: T[], price: number) {
  const cents = Math.round(price * 100);
  const weights = lines.map((line) => Math.max(0, Math.round(line.unitPrice * 100) * line.qty));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (sum <= 0 || cents <= 0 || !lines.length) return { lines, total: cents / 100 };
  let left = cents;
  const next = lines.map((line, index) => {
    const share = index === lines.length - 1 ? left : Math.min(left, Math.round((cents * weights[index]) / sum));
    if (index !== lines.length - 1) left -= share;
    return { ...line, unitPrice: line.qty > 0 ? Math.round(share / line.qty) / 100 : 0, total: share / 100 };
  });
  return { lines: next, total: cents / 100 };
}

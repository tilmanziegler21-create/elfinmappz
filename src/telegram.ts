type Insets = { top: number; bottom: number; left: number; right: number };

export type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};

export async function resolveTelegramWebApp() {
  const first = telegramWebApp();
  if (first) return first;
  if (!/Telegram/i.test(navigator.userAgent)) return null;
  const started = Date.now();
  while (Date.now() - started < 1500) {
    const web = telegramWebApp();
    if (web) return web;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return telegramWebApp();
}

export function telegramWebApp(): TelegramWebApp | null {
  const web = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return web ?? null;
}

export function telegramBotLink(name: string | null | undefined) {
  const value = String(name || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value) || !/[A-Za-z_]/.test(value)) return null;
  return `https://t.me/${value}`;
}

export function courierChatLink(target: { url?: string; start?: string } | null | undefined, botUrl: string | null) {
  const direct = String(target?.url || "");
  if (/^https:\/\/t\.me\/(?!\d+$)[A-Za-z0-9_]{5,32}$/.test(direct)) return direct;
  const start = String(target?.start || "");
  if (!botUrl || !/^ord_[A-Za-z0-9_-]{1,40}$/.test(start)) return "";
  return `${botUrl}?start=${encodeURIComponent(start)}`;
}

export function bindTelegramViewport() {
  const root = document.documentElement;
  const apply = () => {
    const web = telegramWebApp();
    const stable = Number(web?.viewportStableHeight);
    const current = Number(web?.viewportHeight);
    if (web && Number.isFinite(stable) && stable > 0) root.style.setProperty("--app-height", `${Math.round(stable)}px`);
    else if (web && Number.isFinite(current) && current > 0) root.style.setProperty("--app-height", `${Math.round(current)}px`);
    else root.style.removeProperty("--app-height");
    let keyboard = 0;
    if (web && Number.isFinite(stable) && stable > 0 && Number.isFinite(current) && current > 0) keyboard = Math.max(0, Math.round(stable - current));
    const viewport = window.visualViewport;
    if (!web && viewport && viewport.scale <= 1) {
      keyboard = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      if (keyboard < 80) keyboard = 0;
    }
    if (keyboard > 0) root.style.setProperty("--keyboard-inset", `${keyboard}px`);
    else root.style.removeProperty("--keyboard-inset");
    const inset = web?.contentSafeAreaInset?.bottom ?? web?.safeAreaInset?.bottom;
    if (typeof inset === "number" && inset >= 0) root.style.setProperty("--safe-bottom", `${Math.round(inset)}px`);
    else root.style.removeProperty("--safe-bottom");
  };
  apply();
  const web = telegramWebApp();
  web?.onEvent?.("viewportChanged", apply);
  web?.onEvent?.("safeAreaChanged", apply);
  web?.onEvent?.("contentSafeAreaChanged", apply);
  window.visualViewport?.addEventListener("resize", apply);
  window.addEventListener("resize", apply);
  return () => {
    web?.offEvent?.("viewportChanged", apply);
    web?.offEvent?.("safeAreaChanged", apply);
    web?.offEvent?.("contentSafeAreaChanged", apply);
    window.visualViewport?.removeEventListener("resize", apply);
    window.removeEventListener("resize", apply);
  };
}

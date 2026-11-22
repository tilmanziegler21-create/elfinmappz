type Insets = { top: number; bottom: number; left: number; right: number };

export type TelegramWebApp = {
  initData?: string;
  version?: string;
  colorScheme?: "light" | "dark";
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  onEvent?: (event: string, cb: (payload?: { isStateStable?: boolean }) => void) => void;
  offEvent?: (event: string, cb: (payload?: { isStateStable?: boolean }) => void) => void;
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

export function telegramLanguageCode() {
  const code = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  return typeof code === "string" && code.length > 0 && code.length <= 16 ? code : null;
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
  if (!botUrl || !/^https:\/\/t\.me\/(?!\d+$)[A-Za-z0-9_]{5,32}$/.test(botUrl) || !/^ord_[A-Za-z0-9_-]{1,40}$/.test(start)) return "";
  return `${botUrl}?start=${encodeURIComponent(start)}`;
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readCssPx(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return positive(Number.parseFloat(raw));
}

function writeInset(root: HTMLElement, name: string, value: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) root.style.setProperty(name, `${Math.round(value)}px`);
}

export function bindTelegramViewport() {
  const root = document.documentElement;
  let bound: TelegramWebApp | null = null;
  const apply = (payload?: { isStateStable?: boolean }) => {
    if (payload && payload.isStateStable === false) return;
    const web = telegramWebApp();
    const stable = positive(web?.viewportStableHeight) || readCssPx("--tg-viewport-stable-height");
    const current = positive(web?.viewportHeight) || readCssPx("--tg-viewport-height");
    if (stable > 0) root.style.setProperty("--tg-viewport-stable-height", `${Math.round(stable)}px`);
    if (current > 0) root.style.setProperty("--tg-viewport-height", `${Math.round(current)}px`);
    if (web && "safeAreaInset" in web) {
      writeInset(root, "--tg-safe-area-inset-top", web.safeAreaInset?.top);
      writeInset(root, "--tg-safe-area-inset-bottom", web.safeAreaInset?.bottom);
      writeInset(root, "--tg-safe-area-inset-left", web.safeAreaInset?.left);
      writeInset(root, "--tg-safe-area-inset-right", web.safeAreaInset?.right);
    }
    if (web && "contentSafeAreaInset" in web) {
      writeInset(root, "--tg-content-safe-area-inset-top", web.contentSafeAreaInset?.top);
      writeInset(root, "--tg-content-safe-area-inset-bottom", web.contentSafeAreaInset?.bottom);
      writeInset(root, "--tg-content-safe-area-inset-left", web.contentSafeAreaInset?.left);
      writeInset(root, "--tg-content-safe-area-inset-right", web.contentSafeAreaInset?.right);
    }
    let keyboard = stable > 0 && current > 0 ? Math.max(0, Math.round(stable - current)) : 0;
    const viewport = window.visualViewport;
    if (!web && viewport && viewport.scale <= 1) {
      keyboard = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    }
    if (keyboard < 80) keyboard = 0;
    if (keyboard > 0) root.style.setProperty("--keyboard-inset", `${keyboard}px`);
    else root.style.removeProperty("--keyboard-inset");
    const visible = keyboard > 0 && current > 0 ? current : stable;
    if (!web && keyboard > 0 && viewport) root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
    else if (visible > 0) root.style.setProperty("--app-height", `${Math.round(visible)}px`);
    else root.style.removeProperty("--app-height");
  };
  const attach = () => {
    const web = telegramWebApp();
    if (!web || web === bound) return;
    bound?.offEvent?.("viewportChanged", apply);
    bound?.offEvent?.("safeAreaChanged", apply);
    bound?.offEvent?.("contentSafeAreaChanged", apply);
    bound = web;
    web.onEvent?.("viewportChanged", apply);
    web.onEvent?.("safeAreaChanged", apply);
    web.onEvent?.("contentSafeAreaChanged", apply);
    apply();
  };
  const onFocus = (event: FocusEvent) => {
    const node = event.target;
    if (!(node instanceof HTMLElement) || !node.matches("input, textarea, select")) return;
    window.setTimeout(() => {
      const rect = node.getBoundingClientRect();
      const limit = document.getElementById("root")?.getBoundingClientRect();
      if (!limit || rect.bottom > limit.bottom - 8 || rect.top < limit.top + 8) {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }, 60);
  };
  const onResize = () => apply();
  apply();
  attach();
  const started = Date.now();
  const timer = window.setInterval(() => {
    attach();
    if (bound || Date.now() - started > 2000) window.clearInterval(timer);
  }, 40);
  window.visualViewport?.addEventListener("resize", onResize);
  window.addEventListener("resize", onResize);
  document.addEventListener("focusin", onFocus);
  return () => {
    window.clearInterval(timer);
    bound?.offEvent?.("viewportChanged", apply);
    bound?.offEvent?.("safeAreaChanged", apply);
    bound?.offEvent?.("contentSafeAreaChanged", apply);
    window.visualViewport?.removeEventListener("resize", onResize);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("focusin", onFocus);
  };
}

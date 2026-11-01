import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { telegramWebApp } from "./telegram";

export type ThemeName = "light" | "dark";

const MANUAL = "elfin-theme-manual";
const SAVED = "elfin-theme";

export function telegramColorScheme(): ThemeName | null {
  const scheme = telegramWebApp()?.colorScheme;
  return scheme === "light" || scheme === "dark" ? scheme : null;
}

export function readTheme(): ThemeName {
  try {
    if (localStorage.getItem(MANUAL) === "1") {
      const saved = localStorage.getItem(SAVED);
      if (saved === "light" || saved === "dark") return saved;
    }
  } catch {
    /* private mode */
  }
  return telegramColorScheme() ?? "dark";
}

export function paintTheme(theme: ThemeName) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.background = theme === "light" ? "#f4f8fb" : "#05070b";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f8fb" : "#05070b");
  const web = telegramWebApp();
  if (!web) return;
  const header = theme === "light" ? "#f4f8fb" : "#05070b";
  const background = theme === "light" ? "#e7f1f8" : "#05070b";
  try { web.setHeaderColor?.(header); } catch { /* older clients accept only bg_color */ }
  try { web.setBackgroundColor?.(background); } catch { /* optional */ }
  try { web.setBottomBarColor?.(header); } catch { /* optional */ }
}

type ThemeValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const current = document.documentElement.dataset.theme;
    return current === "light" || current === "dark" ? current : readTheme();
  });

  useEffect(() => {
    paintTheme(theme);
  }, [theme]);

  useEffect(() => {
    const pull = () => {
      try {
        if (localStorage.getItem(MANUAL) === "1") return;
      } catch {
        return;
      }
      const scheme = telegramColorScheme();
      if (scheme) setThemeState(scheme);
    };
    pull();
    const web = telegramWebApp();
    web?.onEvent?.("themeChanged", pull);
    const timer = window.setInterval(pull, 50);
    const stop = window.setTimeout(() => window.clearInterval(timer), 2000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      web?.offEvent?.("themeChanged", pull);
    };
  }, []);

  const value = useMemo<ThemeValue>(() => ({
    theme,
    setTheme: (next) => {
      try {
        localStorage.setItem(SAVED, next);
        localStorage.setItem(MANUAL, "1");
      } catch {
        /* private mode */
      }
      setThemeState(next);
    },
  }), [theme]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("theme");
  return value;
}

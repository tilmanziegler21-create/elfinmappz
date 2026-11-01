import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { telegramLanguageCode } from "../telegram";
import de from "./locales/de.json";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";

export const languages = ["ru", "uk", "en", "de"] as const;
export type Lang = (typeof languages)[number];

const packs: Record<Lang, Record<string, string>> = { ru, uk, en, de };
const MANUAL = "elfin-lang-manual";
const SAVED = "elfin-lang";

export const languageName: Record<Lang, string> = {
  ru: "Русский",
  uk: "Українська",
  en: "English",
  de: "Deutsch",
};

export function normalizeLang(code: string | null | undefined): Lang | null {
  const base = String(code || "").trim().toLowerCase().split(/[-_]/)[0];
  if (base === "ru" || base === "uk" || base === "en" || base === "de") return base;
  if (!base) return null;
  return "en";
}

export function detectLang(code: string | null | undefined): Lang {
  try {
    if (localStorage.getItem(MANUAL) === "1") {
      const saved = localStorage.getItem(SAVED);
      if (saved === "ru" || saved === "uk" || saved === "en" || saved === "de") return saved;
    }
  } catch {
    /* private mode */
  }
  if (code) return normalizeLang(code) ?? "en";
  return "ru";
}

export function moneyLocale(lang: Lang) {
  if (lang === "en") return "en-GB";
  if (lang === "uk") return "uk-UA";
  if (lang === "de") return "de-DE";
  return "ru-RU";
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>) {
  const template = packs[lang][key] ?? packs.ru[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""));
}

type I18nValue = {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang(telegramLanguageCode()));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18nValue>(() => ({
    lang,
    t: (key, vars) => translate(lang, key, vars),
    setLang: (next) => {
      try {
        localStorage.setItem(SAVED, next);
        localStorage.setItem(MANUAL, "1");
      } catch {
        /* private mode */
      }
      setLangState(next);
      document.documentElement.lang = next;
    },
  }), [lang]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("i18n");
  return value;
}

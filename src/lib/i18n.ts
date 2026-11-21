// Interface language. Keys are the English text itself, so English needs no
// dictionary except the singular form of plurals; Arabic lives in src/locales/ar.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ar } from "@/locales/ar/index.ts";
import { en } from "@/locales/en/index.ts";

export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "lang";

export function storedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function storeLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit
  }
}

export const directionOf = (lang: Language) => (lang === "ar" ? "rtl" : "ltr");

/** The language in use right now (for code outside React, like the API client). */
export const currentLanguage = (): Language => (i18n.language === "ar" ? "ar" : "en");

void i18n.use(initReactI18next).init({
  lng: storedLanguage(),
  fallbackLng: "en",
  resources: { en: { translation: en }, ar: { translation: ar } },
  // Keys are sentences, which contain dots and colons
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  react: { useSuspense: false },
});

/**
 * Marks a string for translation without translating it, for text defined
 * outside components (schemas, label maps). Translate it where it's shown: t(message).
 */
export const tk = <T extends string>(key: T): T => key;

export default i18n;

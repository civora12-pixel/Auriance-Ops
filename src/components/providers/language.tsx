import { useCallback, useEffect } from "react";
import { Direction } from "radix-ui";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { directionOf, storeLanguage, type Language } from "@/lib/i18n.ts";

function applyToDocument(lang: Language) {
  document.documentElement.lang = lang;
  document.documentElement.dir = directionOf(lang);
}

/** Sets the page language and direction, and tells Radix components which way to open. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const lang: Language = i18n.language === "ar" ? "ar" : "en";
  useEffect(() => applyToDocument(lang), [lang]);
  return <Direction.Provider dir={directionOf(lang)}>{children}</Direction.Provider>;
}

export function useLanguage() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const language: Language = i18n.language === "ar" ? "ar" : "en";
  const setLanguage = useCallback(
    (next: Language) => {
      storeLanguage(next);
      applyToDocument(next);
      void i18n.changeLanguage(next);
      // Server text (errors, notifications, history) comes back in the new language
      void queryClient.invalidateQueries();
    },
    [i18n, queryClient],
  );
  return { language, dir: directionOf(language), setLanguage };
}

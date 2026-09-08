"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { LANGUAGE_STORAGE_KEY, readLanguage, translateText, type Language } from "@/lib/i18n";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const originalText = new WeakMap<Text, string>();

function translateDocument(language: Language) {
  if (typeof document === "undefined") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!text.parentElement?.closest(".language-toggle")) {
      const source = originalText.get(text) ?? text.data;
      originalText.set(text, source);
      text.data = translateText(source, language);
    }
    node = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
    translateDocument(language);
    const observer = new MutationObserver(() => translateDocument(language));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next) => {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        setLanguageState(next);
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { LANGUAGE_STORAGE_KEY, readLanguage, translateText, type Language } from "@/lib/i18n";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const originalText = new WeakMap<Text, { source: string; rendered: string }>();

function translateDocument(language: Language) {
  if (typeof document === "undefined") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!text.parentElement?.closest(".language-toggle, script, style, textarea")) {
      const previous = originalText.get(text);
      // React may reuse a text node for a new score, round, or status.
      const source = previous && text.data === previous.rendered ? previous.source : text.data;
      const rendered = translateText(source, language);
      originalText.set(text, { source, rendered });
      // Even assigning the same value emits a MutationObserver record.
      if (text.data !== rendered) text.data = rendered;
    }
    node = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
    translateDocument(language);
    const options = { childList: true, subtree: true, characterData: true };
    const observer = new MutationObserver(() => {
      // Translation must not observe its own writes and starve the event loop.
      observer.disconnect();
      try {
        translateDocument(language);
      } finally {
        observer.observe(document.body, options);
      }
    });
    observer.observe(document.body, options);
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
  if (!context) {
    return {
      language: readLanguage(),
      setLanguage: () => {},
    };
  }
  return context;
}

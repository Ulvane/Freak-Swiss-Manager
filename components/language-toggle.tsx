"use client";

import { useLanguage } from "@/app/language-provider";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="language-toggle" aria-label="Language / Dil">
      <button type="button" className={language === "en" ? "is-active" : ""} onClick={() => setLanguage("en")}>
        EN
      </button>
      <button type="button" className={language === "tr" ? "is-active" : ""} onClick={() => setLanguage("tr")}>
        TR
      </button>
    </div>
  );
}

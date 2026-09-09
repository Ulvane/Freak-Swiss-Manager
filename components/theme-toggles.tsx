"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribeToAppearance(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-mode"],
  });
  return () => observer.disconnect();
}

export function ThemeToggles() {
  const theme = useSyncExternalStore(
    subscribeToAppearance,
    () => document.documentElement.getAttribute("data-theme") || "red",
    () => "red",
  );
  const mode = useSyncExternalStore(
    subscribeToAppearance,
    () => document.documentElement.getAttribute("data-mode") || "light",
    () => "light",
  );

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("freak-swiss-theme") || "red";
    const userSavedMode = window.localStorage.getItem("freak-swiss-mode");
    const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialMode = userSavedMode || (systemPrefersDark ? "dark" : "light");
    
    
    if (savedTheme === "turquoise") {
      document.documentElement.setAttribute("data-theme", "turquoise");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    if (initialMode === "dark") {
      document.documentElement.setAttribute("data-mode", "dark");
    } else {
      document.documentElement.removeAttribute("data-mode");
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (!window.localStorage.getItem("freak-swiss-mode")) {
        const nextMode = e.matches ? "dark" : "light";
        if (nextMode === "dark") {
          document.documentElement.setAttribute("data-mode", "dark");
        } else {
          document.documentElement.removeAttribute("data-mode");
        }
      }
    };
    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "red" ? "turquoise" : "red";
    window.localStorage.setItem("freak-swiss-theme", newTheme);
    if (newTheme === "turquoise") {
      document.documentElement.setAttribute("data-theme", "turquoise");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  const toggleMode = () => {
    const newMode = mode === "light" ? "dark" : "light";
    window.localStorage.setItem("freak-swiss-mode", newMode);
    if (newMode === "dark") {
      document.documentElement.setAttribute("data-mode", "dark");
    } else {
      document.documentElement.removeAttribute("data-mode");
    }
  };

  return (
    <div className="theme-toggles" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginLeft: "auto" }}>
      <button 
        type="button" 
        onClick={toggleTheme}
        aria-label="Toggle Turquoise Theme"
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          backgroundColor: theme === "red" ? "#03a7bb" : "#e30613",
          border: "1px solid var(--ink)",
          cursor: "pointer"
        }}
        title="Toggle Turquoise Theme"
      />
      <button 
        type="button" 
        onClick={toggleMode}
        aria-label="Toggle Dark Mode"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: "transparent",
          border: "1px solid var(--ink)",
          color: "var(--ink)",
          cursor: "pointer",
          padding: 0
        }}
        title="Toggle Dark Mode"
      >
        {mode === "dark" ? <Sun size={12} /> : <Moon size={12} />}
      </button>
    </div>
  );
}

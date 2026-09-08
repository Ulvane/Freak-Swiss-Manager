"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggles() {
  const [theme, setTheme] = useState("red");
  const [mode, setMode] = useState("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("freak-swiss-theme") || "red";
    const savedMode = window.localStorage.getItem("freak-swiss-mode") || "light";
    setTheme(savedTheme);
    setMode(savedMode);
    
    if (savedTheme === "turquoise") {
      document.documentElement.setAttribute("data-theme", "turquoise");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    if (savedMode === "dark") {
      document.documentElement.setAttribute("data-mode", "dark");
    } else {
      document.documentElement.removeAttribute("data-mode");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "red" ? "turquoise" : "red";
    setTheme(newTheme);
    window.localStorage.setItem("freak-swiss-theme", newTheme);
    if (newTheme === "turquoise") {
      document.documentElement.setAttribute("data-theme", "turquoise");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  const toggleMode = () => {
    const newMode = mode === "light" ? "dark" : "light";
    setMode(newMode);
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

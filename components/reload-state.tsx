"use client";

import { useEffect } from "react";

const SCROLL_STORAGE_PREFIX = "freak-swiss-scroll:";

function storageKey() {
  return `${SCROLL_STORAGE_PREFIX}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function ReloadState() {
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const key = storageKey();
    let savedPosition: { x: number; y: number } | null = null;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) savedPosition = JSON.parse(raw) as { x: number; y: number };
    } catch {
      // Storage can be disabled without affecting the site.
    }

    let saveFrame = 0;
    const savePosition = () => {
      try {
        window.sessionStorage.setItem(
          storageKey(),
          JSON.stringify({ x: window.scrollX, y: window.scrollY }),
        );
      } catch {
        // Storage can be disabled without affecting the site.
      }
    };
    const scheduleSave = () => {
      window.cancelAnimationFrame(saveFrame);
      saveFrame = window.requestAnimationFrame(savePosition);
    };

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", savePosition);

    const navigation = window.performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const shouldRestore = navigation?.type === "reload";
    let resizeObserver: ResizeObserver | null = null;
    let stopTimer = 0;
    let restore: (() => void) | null = null;

    if (shouldRestore && savedPosition && Number.isFinite(savedPosition.y)) {
      const restorePosition = () => window.scrollTo(savedPosition.x || 0, savedPosition.y);
      restore = restorePosition;
      window.requestAnimationFrame(() => window.requestAnimationFrame(restorePosition));
      window.addEventListener("load", restorePosition, { once: true });
      resizeObserver = new ResizeObserver(restorePosition);
      resizeObserver.observe(document.documentElement);
      stopTimer = window.setTimeout(() => resizeObserver?.disconnect(), 2000);
    }

    return () => {
      savePosition();
      window.cancelAnimationFrame(saveFrame);
      window.clearTimeout(stopTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", savePosition);
      if (restore) window.removeEventListener("load", restore);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  return null;
}

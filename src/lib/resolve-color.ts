"use client";

import { useMemo, useState, useEffect } from "react";

// Shared canvas context for OKLCH → hex conversion (created once)
let _ctx: CanvasRenderingContext2D | null = null;
function getCanvasCtx(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  _ctx = canvas.getContext("2d");
  return _ctx;
}

/**
 * Resolve a CSS custom property (e.g. "--chart-1") to a hex color string.
 */
const FALLBACK_COLOR = "oklch(50% 0 0)";

function resolveToHex(cssVar: string): string {
  if (typeof window === "undefined") return FALLBACK_COLOR;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  if (!raw) return FALLBACK_COLOR;
  if (raw.startsWith("#")) return raw;
  const ctx = getCanvasCtx();
  if (!ctx) return FALLBACK_COLOR;
  ctx.fillStyle = raw;
  return ctx.fillStyle;
}

/**
 * Track whether the `<html>` element has the `.dark` class.
 * Re-renders on theme toggle so downstream `useThemeColor` recalculates.
 */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const el = document.documentElement;
    setDark(el.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/**
 * Resolve a CSS custom property to hex, re-resolving when the theme changes.
 */
export function useThemeColor(cssVar: string): string {
  const dark = useIsDark();
  return useMemo(() => resolveToHex(cssVar), [cssVar, dark]);
}

/**
 * Resolve multiple CSS custom properties at once.
 * Returns a Record<cssVar, hex>.
 */
export function useThemeColors(cssVars: string[]): Record<string, string> {
  const dark = useIsDark();
  const key = cssVars.join(",");
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of cssVars) map[v] = resolveToHex(v);
    return map;
  }, [key, dark]);
}

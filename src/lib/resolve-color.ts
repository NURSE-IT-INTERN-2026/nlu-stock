"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";

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
 * Resolve a CSS custom property to hex, re-resolving when the theme changes.
 * ponytail: theme signal via next-themes (mounted in layout.tsx) instead of a hand-rolled MutationObserver.
 */
export function useThemeColor(cssVar: string): string {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return useMemo(() => resolveToHex(cssVar), [cssVar, dark]);
}

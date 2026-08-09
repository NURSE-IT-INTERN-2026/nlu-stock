"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ChartSize {
  width: number;
  height: number;
}

interface ChartContainerProps {
  /** Children rendered only once the container has a positive size. */
  children: (size: ChartSize) => ReactNode;
  /** Container height. Use a fixed number for non-flex layouts (e.g. reports). */
  height?: number | string;
}

// NEVER enable series animation (Bar/Area/Pie `isAnimationActive`, `animationDuration`,
// `animationEasing`) with recharts 3.8.1 on React 19.2 — the entry animation never ticks, the
// shape stays at height 0, and Rectangle.js bails out at `height === 0` returning null. The
// axes and legend still render, so the chart looks alive while showing no data at all: every
// chart in this app was silently empty until 2026-08-09. Every series passes
// isAnimationActive={false}. Re-test with the real charts before touching it.
//
// ponytail: replaces recharts ResponsiveContainer, which logs
// "width(-1) height(-1)" warnings on first render before its ResizeObserver
// fires. We measure ourselves (synchronously in the effect + ResizeObserver
// for updates) and feed explicit width/height to the chart.
export function ChartContainer({ children, height = "100%" }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {size ? children(size) : null}
    </div>
  );
}

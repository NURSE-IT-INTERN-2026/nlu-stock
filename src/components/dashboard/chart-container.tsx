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

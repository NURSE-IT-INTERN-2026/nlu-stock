"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Flow tone: รับเข้า teal, เบิกออก red — stock coming in against stock leaving.
// `text` carries a dark pairing because the -500/-700 ramps are tuned for a light card and
// drop under AA on the dark one.
export type FlowTone = "received" | "issued";

export const FLOW = {
  received: { text: "text-success", bg: "bg-success", soft: "bg-success/10" },
  issued: { text: "text-danger-700 dark:text-danger-400", bg: "bg-danger-500", soft: "bg-danger-500/10" },
} as const satisfies Record<FlowTone, { text: string; bg: string; soft: string }>;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Counts up to `value` on mount. Renders the final number directly under reduced motion —
 *  the global CSS rule only neutralises CSS animation, not a rAF loop. */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  // Starts at 0 on both server and client so hydration matches; the first frame takes over
  // from there. Every write happens inside a rAF callback, never synchronously in the effect.
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const start = performance.now();
    const tick = (now: number) => {
      if (reduced) return setDisplay(value);
      const p = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <span className={cn("tabular-nums", className)}>{display.toLocaleString("th-TH")}</span>;
}

/**
 * Loading / error / empty for one widget's body. Every widget on this page has the same three
 * non-happy states and they were being spelled out eight times; the copy that matters is the
 * empty message, which is the only part a caller passes.
 */
export function WidgetState({
  isLoading,
  error,
  onRetry,
  isEmpty,
  icon: Icon,
  emptyTitle,
  emptyHint,
  skeletonClassName = "h-[240px] w-full rounded-xl",
  children,
}: {
  isLoading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  isEmpty?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  emptyTitle?: string;
  emptyHint?: string;
  skeletonClassName?: string;
  children: React.ReactNode;
}) {
  if (isLoading) return <div className={cn("animate-pulse bg-muted", skeletonClassName)} />;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <p className="text-sm text-destructive">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-3 py-1 text-sm hover:bg-secondary"
        >
          โหลดใหม่
        </button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
        {Icon ? (
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <Icon className="size-5 text-muted-foreground" />
          </span>
        ) : null}
        <div className="text-center">
          <p className="text-[13px] font-medium text-foreground">{emptyTitle}</p>
          {emptyHint ? <p className="mt-0.5 text-xs text-muted-foreground">{emptyHint}</p> : null}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * One KPI number. `unit` is never optional in practice on this page — the dashboard mixes
 * ครั้ง (events) and ชิ้น (things) deliberately, and an unlabelled number is the one way that
 * mix turns into a misreading.
 */
export function StatCard({
  label,
  value,
  unit,
  bar,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  /** [filled fraction 0–1, tailwind bg class] */
  bar: [number, string];
  hint?: string;
}) {
  return (
    <div className="animate-rise rounded-2xl border bg-card p-4 shadow-lg shadow-black/[0.04]">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold leading-none tracking-tight tabular-nums">{value}</span>
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("bar-grow h-full rounded-full", bar[1])}
          style={{ width: `${Math.max(4, Math.min(100, bar[0] * 100))}%` }}
        />
      </div>
      {hint ? <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Month-over-month change chip. */
export function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        up ? "bg-success/10 text-success-700 dark:text-success-200" : "bg-destructive/10 text-danger-700 dark:text-danger-400",
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

/** Bar sparkline — last bucket at full opacity, history dimmed. */
export function Sparkline({ data, tone }: { data: number[]; tone: FlowTone }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-12 flex-1 items-end gap-1" aria-hidden>
      {data.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-t-[3px]",
            FLOW[tone].bg,
            i === data.length - 1 ? "opacity-100" : "opacity-25",
          )}
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            animation: `rise var(--duration-slow) var(--ease-out-expo) ${i * 45}ms both`,
          }}
        />
      ))}
    </div>
  );
}

/** Stacked proportion bar. Zero-value segments are dropped so they cannot draw a hairline. */
export function SegmentBar({
  segments,
  delay = 0,
}: {
  segments: { value: number; className: string; title?: string }[];
  delay?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((s, i) =>
        s.value === 0 ? null : (
          <div
            key={i}
            className={cn("bar-grow h-full", s.className)}
            title={s.title}
            style={{ width: `${(s.value / total) * 100}%`, animationDelay: `${delay + i * 90}ms` }}
          />
        ),
      )}
    </div>
  );
}

/** `style` is for colours that only exist at runtime — a chart colour resolved from a CSS
 *  variable, or a status colour that ships from the API. Everything else uses className. */
export function Dot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <i className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={style} />;
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Shared panel chrome: header strip + body, matching Card's radius and surface. */
export function Panel({
  title,
  hint,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "animate-rise flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/[0.04]",
        className,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-secondary/40 px-4 py-3">
        <SectionTitle title={title} hint={hint} />
        {action}
      </div>
      <div className={cn("flex flex-1 flex-col p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

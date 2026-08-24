import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One colour per kind of stock event. Every report surface — pill, stat card, table header,
 *  chip, chart bar — takes a token instead of picking its own `bg-emerald-100`, which is how
 *  the same "คืนครบ" ended up three different greens across three tabs.
 *  `ready` is deliberately an alias of `stockin`: "พร้อมใช้งาน" and "กลับเข้าคลัง" are the same
 *  good news, and two greens no eye can separate is one colour with two names. */
export type Token =
  | "issue" | "borrow" | "inuse" | "stockin" | "damage"
  | "repair" | "dispose" | "maintain" | "value" | "lost" | "ready";

/** Written out in full because Tailwind only sees class names that appear literally. */
export const tokenText: Record<Token, string> = {
  issue: "text-issue", borrow: "text-borrow", inuse: "text-inuse",
  stockin: "text-stockin", damage: "text-damage", repair: "text-repair",
  dispose: "text-dispose", maintain: "text-maintain", value: "text-value",
  lost: "text-lost", ready: "text-stockin",
};

/** For anywhere the colour has to be a value rather than a class — inline `style`, recharts. */
export const tokenVar: Record<Token, string> = {
  issue: "var(--issue)", borrow: "var(--borrow)", inuse: "var(--inuse)",
  stockin: "var(--stockin)", damage: "var(--damage)", repair: "var(--repair)",
  dispose: "var(--dispose)", maintain: "var(--maintain)", value: "var(--value)",
  lost: "var(--lost)", ready: "var(--stockin)",
};

/** A wash of the token colour over the card, not a flat fill: the tokens are tuned to be
 *  readable *as text*, so at full strength they swallow whatever sits on top of them. */
export function tokenTint(token: Token, pct: number): string {
  return `color-mix(in oklab, ${tokenVar[token]} ${pct}%, var(--card))`;
}

/** No token = the muted pill. Some states are genuinely uneventful ("ยังไม่คืน" on a loan that
 *  is not due yet) and colouring them spends attention the reader needs for the ones that are. */
export function Pill({ token, children }: { token?: Token; children: ReactNode }) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  if (!token) {
    return <span className={cn(base, "border-border bg-muted text-muted-foreground")}>{children}</span>;
  }
  return (
    <span
      className={cn(base, tokenText[token])}
      style={{
        borderColor: `color-mix(in oklab, ${tokenVar[token]} 40%, transparent)`,
        backgroundColor: tokenTint(token, 12),
      }}
    >
      {children}
    </span>
  );
}

/** Set on a `<TabsList variant="segment">` trigger to colour its active fill. */
export function segmentStyle(token: Token): CSSProperties {
  return { "--chip": tokenVar[token] } as CSSProperties;
}

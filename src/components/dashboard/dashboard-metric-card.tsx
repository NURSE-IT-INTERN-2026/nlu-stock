"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Package, Wrench, CalendarClock, Undo2 } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  CheckCircle2,
  Package,
  Wrench,
  CalendarClock,
  Undo2,
};

const BADGE_BG: Record<string, string> = {
  "text-orange-500": "bg-warning/10",
  "text-info-500": "bg-info-500/10",
  "text-danger-500": "bg-danger-500/10",
  "text-success": "bg-success/10",
};

interface DashboardMetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  iconName: string;
  color: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function DashboardMetricCard({ title, value, subtitle, iconName, color, href, onClick, active, className }: DashboardMetricCardProps) {
  const Icon = ICON_MAP[iconName];
  const badgeBg = BADGE_BG[color] ?? "bg-muted";

  const inner = (
    <CardContent className="px-4 py-3 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground tracking-wide leading-tight">{title}</p>
          <p className={`text-2xl font-extrabold leading-none tracking-tight mt-0.5 ${value === 0 ? "text-muted-foreground" : "text-foreground"}`}>
            {value}
          </p>
        </div>
        {Icon && (
          <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${badgeBg}`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {value === 0 ? "ปกติ" : subtitle}
      </p>
    </CardContent>
  );

  const ariaLabel = `${title}: ${value}${subtitle ? `, ${subtitle}` : ""}`;

  // Clickable (client filter) — render as button, highlight when active.
  if (onClick) {
    return (
      <Card
        className={[
          "transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer py-0 gap-0",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          active && "ring-2 ring-primary",
          className,
        ].filter(Boolean).join(" ")}
      >
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          aria-label={ariaLabel}
          className="block w-full text-left focus:outline-none"
        >
          {inner}
        </button>
      </Card>
    );
  }

  if (!href) {
    return (
      <Card className={["py-0 gap-0", className].filter(Boolean).join(" ")}>
        {inner}
      </Card>
    );
  }

  return (
    <Card
      className={[
        "transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] py-0 gap-0",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      ].filter(Boolean).join(" ")}
    >
      <Link
        href={href}
        className="block focus:outline-none"
        aria-label={ariaLabel}
      >
        {inner}
      </Link>
    </Card>
  );
}

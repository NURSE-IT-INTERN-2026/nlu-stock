"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Package, Wrench } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  Package,
  Wrench,
};

const BADGE_BG: Record<string, string> = {
  "text-orange-500": "bg-orange-500/10",
  "text-blue-500": "bg-blue-500/10",
  "text-red-500": "bg-red-500/10",
};

interface DashboardMetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  iconName: string;
  color: string;
  href?: string;
  className?: string;
}

export function DashboardMetricCard({ title, value, subtitle, iconName, color, href, className }: DashboardMetricCardProps) {
  const router = useRouter();
  const Icon = ICON_MAP[iconName];
  const badgeBg = BADGE_BG[color] ?? "bg-muted";

  return (
    <Card
      className={["cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 py-0 gap-0", href ? "" : "pointer-events-none", className].filter(Boolean).join(" ")}
      onClick={href ? () => router.push(href) : undefined}
    >
      <CardContent className="px-4 py-2.5 flex flex-col justify-center h-full">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground tracking-wide leading-tight">{title}</p>
            <p className={`text-2xl font-extrabold leading-none tracking-tight mt-0.5 ${value === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
              {value}
            </p>
          </div>
          {Icon && (
            <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${badgeBg}`}>
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {value === 0 ? "All clear" : subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

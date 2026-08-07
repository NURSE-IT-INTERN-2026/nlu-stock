import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ComingSoonProps {
  title: string;
  subtitle?: string;
  note?: string;
  icon?: ReactNode;
  minHeight?: number;
  className?: string;
}

// Phase 1 placeholder for widgets whose real data source is not wired yet. Shows an honest
// "เร็ว ๆ นี้" state instead of mock numbers on a live dashboard.
export function ComingSoon({ title, subtitle, note, icon, minHeight = 200, className }: ComingSoonProps) {
  return (
    <Card className={className}>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent
        className="flex flex-col items-center justify-center gap-2 text-center"
        style={{ minHeight }}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon ?? <Sparkles className="size-5" />}
        </span>
        <p className="text-sm font-medium text-foreground">เร็ว ๆ นี้</p>
        <p className="max-w-[36ch] text-xs text-muted-foreground">
          {note ?? "ส่วนนี้กำลังพัฒนา ยังไม่มีข้อมูลจริงเชื่อมต่อ"}
        </p>
      </CardContent>
    </Card>
  );
}

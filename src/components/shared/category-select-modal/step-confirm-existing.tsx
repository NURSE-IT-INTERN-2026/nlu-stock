"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "@/lib/api";
import { profileIcon } from "@/lib/profile-icons";

interface StepConfirmExistingProps {
  category: CategoryOption;
}

export function StepConfirmExisting({ category }: StepConfirmExistingProps) {
  const Icon = profileIcon(category.profile?.icon);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          ตรวจสอบข้อมูลก่อนเลือกหมวดหมู่นี้
        </p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-base font-semibold text-foreground">{category.name}</div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0", category.profile?.color ?? "")}
              >
                {category.profile?.name ?? "—"}
              </Badge>
              {category._count != null && (
                <span className="text-xs text-muted-foreground">
                  {category._count.items} รายการ
                </span>
              )}
            </div>
            {category.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

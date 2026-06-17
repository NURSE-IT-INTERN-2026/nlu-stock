"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getProfiles } from "@/lib/api";
import type { ProfileOption } from "@/lib/api";
import { profileIcon } from "@/lib/profile-icons";

interface StepCreateConfirmProps {
  name: string;
  profileId: string;
  description: string;
  onDescriptionChange: (desc: string) => void;
}

export function StepCreateConfirm({
  name,
  profileId,
  description,
  onDescriptionChange,
}: StepCreateConfirmProps) {
  const [profile, setProfile] = useState<ProfileOption | null>(null);
  useEffect(() => {
    getProfiles()
      .then((ps) => setProfile(ps.find((p) => p.id === profileId) ?? null))
      .catch(() => setProfile(null));
  }, [profileId]);
  const Icon = profileIcon(profile?.icon);

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="new-cat-desc">รายละเอียด (ไม่บังคับ)</Label>
        <Textarea
          id="new-cat-desc"
          placeholder="รายละเอียดเพิ่มเติม เช่น ขอบเขตของหมวดหมู่นี้..."
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="min-h-24 bg-card"
        />
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          สรุปหมวดหมู่ใหม่
        </div>
        <div className="mt-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <dl className="flex-1 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">ชื่อหมวดหมู่</dt>
              <dd className="text-right font-medium text-foreground">{name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">ประเภท</dt>
              <dd>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0", profile?.color ?? "")}
                >
                  {profile?.name ?? "—"}
                </Badge>
              </dd>
            </div>
            {description && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">รายละเอียด</dt>
                <dd className="text-right text-foreground max-w-[60%]">{description}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

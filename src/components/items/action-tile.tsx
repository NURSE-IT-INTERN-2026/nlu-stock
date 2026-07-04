import React from "react";
import { cn } from "@/lib/utils";

type ActionTileProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "primary" | "default" | "destructive";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const ActionTile = React.forwardRef<HTMLButtonElement, ActionTileProps>(
  function ActionTile({ icon: Icon, label, tone, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0",
          tone === "primary" && "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
          tone === "default" && "bg-card border-border hover:border-primary/40",
          tone === "destructive" && "bg-card border-border text-destructive hover:bg-destructive/5 hover:border-destructive/40",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "grid place-items-center size-10 rounded-xl shrink-0",
            tone === "primary" && "bg-primary-foreground/15",
            tone === "default" && "bg-primary/10 text-primary",
            tone === "destructive" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </button>
    );
  },
);

"use client";

import { useState } from "react";

/** Inline-editable quantity: click to type, clamps to [1, max]. */
export function EditableQty({ value, max, unit, onChange }: {
  value: number;
  max?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseInt(draft) || 1;
          const clamped = Math.max(1, max ? Math.min(v, max) : v);
          onChange(clamped);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="w-14 h-6 text-center text-sm font-medium tabular-nums bg-transparent border-0 px-1 outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`แก้ไขจำนวน ${value} ${unit}`}
      className="flex items-baseline gap-0.5 w-14 justify-center"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
    >
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </button>
  );
}

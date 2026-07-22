"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface NumericInputProps {
  value: number;
  /** Fires on blur with a clamped value (>= min). Not on every keystroke. */
  onCommit: (n: number) => void;
  min: number;
  id?: string;
  className?: string;
  /** Notified when validity changes (true = valid). */
  onValidityChange?: (valid: boolean) => void;
  /** Show red border on the input itself when invalid (default true). Set false when a parent box handles the error styling. */
  showBorderError?: boolean;
}

/**
 * Number input that allows clearing/retyping: keeps a string draft while typing
 * (empty allowed), clamps to `min` only on blur. ponytail: validate on blur, not keystroke.
 */
export function NumericInput({ value, onCommit, min, id, className, onValidityChange, showBorderError = true }: NumericInputProps) {
  const [draft, setDraft] = useState(String(value));

  // Report validity up so parents can gate submit. Empty is treated as valid (typing in progress).
  const report = (v: string) => {
    if (!onValidityChange) return;
    const n = parseInt(v, 10);
    onValidityChange(v === "" || (!Number.isNaN(n) && n >= min));
  };

  // Sync draft when the external value changes (reset, back-navigation).
  useEffect(() => {
    setDraft(String(value));
    report(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Guide, don't block: flag a typed-below-min value red while editing (empty is allowed,
  // it's "typing in progress" — not invalid). Force (clamp) only on blur.
  const num = parseInt(draft, 10);
  const invalid = draft !== "" && !Number.isNaN(num) && num < min;

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={draft}
      aria-invalid={invalid && showBorderError}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d+$/.test(v)) {
          setDraft(v);
          report(v);
        }
      }}
      onBlur={() => {
        const clamped = Number.isNaN(num) || num < min ? min : num;
        setDraft(String(clamped));
        report(String(clamped));
        if (clamped !== value) onCommit(clamped);
      }}
      className={className}
    />
  );
}

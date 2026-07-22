"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/shared/numeric-input";

export interface CodeMeta {
  copyCount: number;
  isSet: boolean;
  setSize: number;
}

interface CodeBuilderProps {
  /** Profile code prefix */
  prefix: string;
  value: string;
  onChange: (code: string) => void;
  copyCount: number;
  onCopyCountChange: (count: number) => void;
  onMetaChange?: (meta: CodeMeta) => void;
  /** Restore state when navigating back */
  initialMeta?: CodeMeta | null;
  /** Allow set/build mode (BOOK/TOY). Default true. */
  canSet?: boolean;
}

export function CodeBuilder({
  prefix,
  value,
  onChange,
  copyCount,
  onCopyCountChange,
  onMetaChange,
  initialMeta,
  canSet = true,
}: CodeBuilderProps) {
  const [running, setRunning] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSet, setIsSet] = useState(initialMeta?.isSet ?? false);
  const [setSize, setSetSize] = useState(initialMeta?.setSize ?? 2);
  const lastEmitted = useRef<string>(value);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/items/suggest-code?prefix=${encodeURIComponent(prefix)}`);
      if (res.ok) {
        const data = await res.json();
        setRunning(data.nextNumber ?? "001");
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [prefix]);

  useEffect(() => { fetchNext(); }, [fetchNext]);

  // Build and emit code: NLU-PREFIX-NNN[-SNN] (copy -CNN is added per SubItem at create time)
  useEffect(() => {
    if (!running) return;
    let code = `NLU-${prefix}-${running}`;
    if (canSet && isSet && setSize > 1) {
      code += `-S${String(setSize).padStart(2, "0")}`;
    }
    if (lastEmitted.current !== code) {
      lastEmitted.current = code;
      onChange(code);
    }
    onMetaChange?.({ copyCount, isSet, setSize });
  }, [prefix, running, canSet, isSet, setSize, copyCount, onChange, onMetaChange]);

  return (
    <div className="space-y-4">
      {/* Running number (auto, read-only) */}
      <div className="space-y-2">
        <Label htmlFor="code-running">เลขรหัส</Label>
        <Input
          id="code-running"
          value={running ? `ลำดับที่ ${running}` : "กำลังสร้าง..."}
          disabled
          className="bg-muted"
        />
      </div>

      {/* Set toggle + size — BOOK/TOY only */}
      {canSet && (
        <div className="w-full rounded-lg border border-border bg-card divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-3 py-2.5">
            <Label htmlFor="set-toggle" className="cursor-pointer text-sm">เป็นชุด (set)</Label>
            <button
              id="set-toggle"
              type="button"
              role="switch"
              aria-checked={isSet}
              onClick={() => setIsSet(!isSet)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                isSet ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  isSet ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {isSet && (
            <div className="flex items-center justify-between gap-4 px-3 py-2.5">
              <Label htmlFor="set-size" className="text-sm">จำนวนในชุด</Label>
              <NumericInput
                id="set-size"
                value={setSize}
                onCommit={setSetSize}
                min={2}
                className="w-20 bg-background text-center text-gray-900"
              />
            </div>
          )}
        </div>
      )}

      {/* Copy / piece count */}
      <div className="w-full rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <div>
            <Label htmlFor="copy-count" className="text-sm">จำนวนชิ้น (copy)</Label>
            {copyCount > 1 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {!canSet
                  ? "แต่ละชิ้นคือทรัพย์สินคนละตัว"
                  : `C01 ถึง C${String(copyCount).padStart(2, "0")}`}
              </p>
            )}
          </div>
          <NumericInput
            id="copy-count"
            value={copyCount}
            onCommit={onCopyCountChange}
            min={1}
            className="w-20 bg-background text-center text-gray-900"
          />
        </div>
      </div>

      {/* Preview */}
      {loading ? (
        <div className="h-10 rounded-lg border bg-muted animate-pulse" />
      ) : value ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-xs text-muted-foreground">รหัสที่จะได้:</span>
          <p className="text-sm font-mono font-semibold text-foreground">{value}</p>
        </div>
      ) : null}
    </div>
  );
}

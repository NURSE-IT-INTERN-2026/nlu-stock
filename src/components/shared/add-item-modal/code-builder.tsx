"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/shared/numeric-input";
import { withBase } from "@/lib/base-path";

export interface CodeMeta {
  copyCount: number;
}

interface CodeBuilderProps {
  /** Profile code prefix */
  prefix: string;
  value: string;
  onChange: (code: string) => void;
  copyCount: number;
  onCopyCountChange: (count: number) => void;
  onMetaChange?: (meta: CodeMeta) => void;
}

export function CodeBuilder({
  prefix,
  value,
  onChange,
  copyCount,
  onCopyCountChange,
  onMetaChange,
}: CodeBuilderProps) {
  const [running, setRunning] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const lastEmitted = useRef<string>(value);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(withBase(`/api/items/suggest-code?prefix=${encodeURIComponent(prefix)}`));
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

  // Build and emit code: NLU-PREFIX-NNN (copy -CNN is added per SubItem at create time)
  useEffect(() => {
    if (!running) return;
    const code = `NLU-${prefix}-${running}`;
    if (lastEmitted.current !== code) {
      lastEmitted.current = code;
      onChange(code);
    }
    onMetaChange?.({ copyCount });
  }, [prefix, running, copyCount, onChange, onMetaChange]);

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

      {/* Copy / piece count */}
      <div className="w-full rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <div>
            <Label htmlFor="copy-count" className="text-sm">จำนวนชิ้น (copy)</Label>
            {copyCount > 1 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {`C01 ถึง C${String(copyCount).padStart(2, "0")}`}
              </p>
            )}
          </div>
          <NumericInput
            id="copy-count"
            value={copyCount}
            onCommit={onCopyCountChange}
            min={1}
            className="w-20 bg-background text-center text-foreground"
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

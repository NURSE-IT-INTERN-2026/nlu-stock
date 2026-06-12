"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface Group {
  code: string;
  name: string;
}

interface BookCodeBuilderProps {
  prefix: string; // "BOOK" | "TOY"
  value: string;
  onChange: (code: string) => void;
  /** Number of copies to create */
  copyCount: number;
  onCopyCountChange: (count: number) => void;
}

export function BookCodeBuilder({ prefix, value, onChange, copyCount, onCopyCountChange }: BookCodeBuilderProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [isNewGroup, setIsNewGroup] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [setSize, setSetSize] = useState(2);
  const [bookNumber, setBookNumber] = useState<string>("");
  const lastEmitted = useRef<string>(value);

  // Fetch groups on mount
  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/items/suggest-code?prefix=${encodeURIComponent(prefix)}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [prefix]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // When group selected (existing or new), fetch next book number
  const fetchNextBook = useCallback(async (groupCode: string) => {
    try {
      const res = await fetch(`/api/items/suggest-code?prefix=${encodeURIComponent(prefix)}&code=${groupCode}`);
      if (res.ok) {
        const data = await res.json();
        setBookNumber(data.nextNumber ?? "001");
        return data.suggestedCode ?? "";
      }
    } catch {
      // silent
    }
    return "";
  }, [prefix]);

  // Build and emit code whenever fields change
  useEffect(() => {
    if (!selectedGroup || !bookNumber) {
      if (lastEmitted.current !== "") {
        lastEmitted.current = "";
        onChange("");
      }
      return;
    }

    let code = `NLU-${prefix}-${selectedGroup}-${bookNumber}`;
    if (isSet && setSize > 1) {
      code += `-S${String(setSize).padStart(2, "0")}`;
    }
    if (lastEmitted.current !== code) {
      lastEmitted.current = code;
      onChange(code);
    }
  }, [prefix, selectedGroup, bookNumber, isSet, setSize, onChange]);

  const handleSelectGroup = async (val: string | null) => {
    if (!val) return;
    if (val === "__new__") {
      setIsNewGroup(true);
      setSelectedGroup("");
      // Get next group number
      try {
        const res = await fetch(`/api/items/suggest-code?prefix=${encodeURIComponent(prefix)}`);
        if (res.ok) {
          const data = await res.json();
          const nextGroup = data.nextNumber ?? "001";
          setSelectedGroup(nextGroup);
          await fetchNextBook(nextGroup);
        }
      } catch {
        // silent
      }
    } else {
      setIsNewGroup(false);
      setSelectedGroup(val);
      await fetchNextBook(val);
    }
  };

  return (
    <div className="space-y-4">
      {/* หมวด */}
      <div className="space-y-2">
        <Label>หมวด</Label>
        {loading ? (
          <div className="h-10 rounded-md border bg-muted animate-pulse" />
        ) : (
          <Select value={isNewGroup ? "__new__" : selectedGroup} onValueChange={handleSelectGroup}>
            <SelectTrigger className="bg-card">
              <span className={selectedGroup ? "text-foreground" : "text-muted-foreground"}>
                {selectedGroup
                  ? isNewGroup
                    ? `หมวดใหม่ (${selectedGroup})`
                    : `หมวด ${selectedGroup} — ${groups.find(g => g.code === selectedGroup)?.name ?? ""}`
                  : "เลือกหมวด"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.code} value={g.code}>
                  หมวด {g.code} — {g.name}
                </SelectItem>
              ))}
              <SelectItem value="__new__">
                <span className="flex items-center gap-1.5 text-primary">
                  <Plus className="h-3 w-3" />
                  สร้างหมวดใหม่
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* เล่มที่ (auto-gen, read-only) */}
      {selectedGroup && (
        <div className="space-y-2">
          <Label>เล่มที่</Label>
          <Input
            value={bookNumber ? `เล่มที่ ${bookNumber}` : "กำลังสร้าง..."}
            disabled
            className="bg-muted"
          />
        </div>
      )}

      {/* Set toggle */}
      {selectedGroup && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isSet}
              onClick={() => setIsSet(!isSet)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                isSet ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  isSet ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <Label className="cursor-pointer" onClick={() => setIsSet(!isSet)}>
              เป็นชุด (set)
            </Label>
          </div>

          {isSet && (
            <div className="space-y-2 pl-14">
              <Label className="text-xs">จำนวนในชุด</Label>
              <Input
                type="number"
                min={2}
                value={setSize}
                onChange={(e) => setSetSize(Math.max(2, parseInt(e.target.value) || 2))}
                className="w-24 bg-card"
              />
            </div>
          )}
        </div>
      )}

      {/* Copy count */}
      {selectedGroup && (
        <div className="space-y-2">
          <Label>จำนวน copy</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              value={copyCount}
              onChange={(e) => onCopyCountChange(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 bg-card"
            />
            <span className="text-xs text-muted-foreground">
              {copyCount === 1 ? "เล่มเดี่ยว" : `${copyCount} copies (C01–C${String(copyCount).padStart(2, "0")})`}
            </span>
          </div>
        </div>
      )}

      {/* Preview */}
      {value && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-xs text-muted-foreground">รหัสที่จะได้:</span>
          <p className="text-sm font-mono font-semibold text-foreground">{value}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPublicLocations } from "@/lib/api";

interface Loc {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
  name: string;
}

const NONE_DETAIL = "__none__";

interface Props {
  /** seed the cascade from this location id once on mount */
  initialLocationId: string | null;
  /** reports the resolved location whenever it changes */
  onChange: (id: string | null, name?: string) => void;
  className?: string;
}

/**
 * Cascade picker: อาคาร → ชั้น → ห้อง → รายละเอียด.
 * Fetches public locations itself, seeds from initialLocationId, resolves to a single location id.
 * Shared by MoveLocationDialog and EditItemDialog.
 */
export function LocationCascadePicker({ initialLocationId, onChange, className }: Props) {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [b, setB] = useState("");
  const [f, setF] = useState("");
  const [r, setR] = useState("");
  const [d, setD] = useState("");

  // Fetch + seed once on mount (parents remount via key / fresh dialog open).
  useEffect(() => {
    let alive = true;
    getPublicLocations()
      .then((data) => {
        if (!alive) return;
        const all = data as Loc[];
        setLocs(all);
        const cur = initialLocationId ? all.find((l) => l.id === initialLocationId) : null;
        setB(cur?.building ?? "");
        setF(cur?.floor ?? "");
        setR(cur?.room ?? "");
        setD(cur?.detail ?? "");
      })
      .catch(() => setLocs([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildings = useMemo(() => [...new Set(locs.map((l) => l.building))], [locs]);
  const floors = useMemo(() => [...new Set(locs.filter((l) => l.building === b).map((l) => l.floor))], [locs, b]);
  const rooms = useMemo(() => [...new Set(locs.filter((l) => l.building === b && l.floor === f).map((l) => l.room))], [locs, b, f]);
  const detailOpts = useMemo(() => {
    const at = locs.filter((l) => l.building === b && l.floor === f && l.room === r);
    const nonNull = [...new Set(at.map((l) => l.detail).filter((x): x is string => !!x))];
    const hasNull = at.some((l) => l.detail === null);
    return [...(hasNull ? [NONE_DETAIL] : []), ...nonNull];
  }, [locs, b, f, r]);

  const { id: resolvedId, name: resolvedName } = useMemo(() => {
    if (!b || !f || !r) return { id: null, name: "" };
    const wantDetail = detailOpts.length > 0;
    if (wantDetail && !d) return { id: null, name: "" };
    const target = !wantDetail ? null : d === NONE_DETAIL ? null : d;
    const found = locs.find((l) => l.building === b && l.floor === f && l.room === r && l.detail === target);
    return { id: found?.id ?? null, name: found?.name ?? "" };
  }, [locs, b, f, r, d, detailOpts]);

  // Report up — only once locations have loaded (avoid spurious null before seed).
  useEffect(() => {
    if (locs.length === 0) return;
    onChange(resolvedId, resolvedName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId, resolvedName, locs.length]);

  const pick = (setter: (v: string) => void, reset: (() => void)[]) => (v: string | null) => {
    if (v == null) return;
    setter(v);
    reset.forEach((fn) => fn());
  };
  const resetFromFloor = () => { setF(""); setR(""); setD(""); };
  const resetFromRoom = () => { setR(""); setD(""); };
  const resetDetail = () => setD("");

  const valText = (value: string, placeholder: string, fmt?: (v: string) => string) => (
    <span className={value ? "text-foreground" : "text-muted-foreground"}>
      {value ? (fmt ? fmt(value) : value) : placeholder}
    </span>
  );
  const triggerCls = "w-full h-10 bg-card border-input shadow-none hover:bg-muted/40";

  return (
    <div className={className ?? "space-y-4"}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <Field label="อาคาร">
          <Select value={b} onValueChange={pick(setB, [resetFromFloor])}>
            <SelectTrigger className={triggerCls}>
              <SelectValue placeholder="เลือกอาคาร">{valText(b, "เลือกอาคาร")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {buildings.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ชั้น">
          <Select value={f} onValueChange={pick(setF, [resetFromRoom])} disabled={!b}>
            <SelectTrigger className={triggerCls}>
              <SelectValue placeholder="เลือกชั้น">{valText(f, "เลือกชั้น")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {floors.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ห้อง" className={detailOpts.length === 0 ? "col-span-2" : ""}>
          <Select value={r} onValueChange={pick(setR, [resetDetail])} disabled={!f}>
            <SelectTrigger className={triggerCls}>
              <SelectValue placeholder="เลือกห้อง">{valText(r, "เลือกห้อง", (v) => `ห้อง ${v}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rooms.map((x) => <SelectItem key={x} value={x}>{`ห้อง ${x}`}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {detailOpts.length > 0 && (
          <Field label="รายละเอียด">
            <Select value={d} onValueChange={pick(setD, [])} disabled={!r}>
              <SelectTrigger className={triggerCls}>
                <SelectValue placeholder="เลือกรายละเอียด">
                  {valText(d, "เลือกรายละเอียด", (v) => (v === NONE_DETAIL ? "ไม่มีรายละเอียด" : v))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {detailOpts.map((x) => <SelectItem key={x} value={x}>{x === NONE_DETAIL ? "ไม่มีรายละเอียด" : x}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${resolvedName ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
        <MapPin className={`size-4 shrink-0 ${resolvedName ? "text-primary" : "text-muted-foreground/60"}`} />
        {resolvedName ? (
          <span className="text-sm font-medium text-foreground">{resolvedName}</span>
        ) : (
          <span className="text-sm text-muted-foreground">เลือกทีละขั้นจนครบ</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

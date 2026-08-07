"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/shared/combobox";
import { getPublicLocations, findOrCreateLocation } from "@/lib/api";

interface Loc {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
  name: string;
}

/** What the picker emits: a complete destination descriptor, or none. The
 *  parent resolves it to an id at submit time (find-or-create) — the picker
 *  never writes, so typing partial values can't create garbage locations. */
export type LocationRef =
  | { kind: "none" }
  | { kind: "ok"; building: string; floor: string; room: string; detail: string | null; name: string };

/** Resolve a LocationRef to a location id, creating the location if new. */
export async function resolveLocationId(ref: LocationRef): Promise<string | null> {
  if (ref.kind !== "ok") return null;
  const loc = await findOrCreateLocation({ building: ref.building, floor: ref.floor, room: ref.room, detail: ref.detail });
  return loc.id;
}

interface Props {
  /** seed the cascade from this location id once on mount */
  initialLocationId: string | null;
  /** reports the resolved destination descriptor whenever it changes */
  onChange: (ref: LocationRef) => void;
  className?: string;
  /** true = pick-only: no "เพิ่ม" affordance, and only a combo that matches an
   *  existing Location is ever emitted (e.g. นำไปใช้งาน — locations must already
   *  be set up by an admin, staff can't create new ones from here). */
  restrictToExisting?: boolean;
}

/**
 * Location picker with creatable comboboxes (อาคาร → ชั้น → ห้อง/ตำแหน่ง → รายละเอียด).
 * `noRoom` toggle = ของไม่ได้อยู่ในห้อง → ฟิลด์ "ตำแหน่ง" แทน "ห้อง". Every field accepts a
 * brand-new value (unless `restrictToExisting`). Emits a LocationRef; shared by
 * MoveLocationDialog + EditItemDialog + StationInRoomDialog.
 */
export function LocationCascadePicker({ initialLocationId, onChange, className, restrictToExisting = false }: Props) {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [b, setB] = useState("");
  const [f, setF] = useState("");
  const [r, setR] = useState("");
  const [d, setD] = useState("");
  const [noRoom, setNoRoom] = useState(false);
  const [pos, setPos] = useState("");

  // Fetch + seed once on mount.
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
  const floorsFor = (building: string) => [...new Set(locs.filter((l) => l.building === building).map((l) => l.floor))];
  const roomsFor = (building: string, floor: string) => [...new Set(locs.filter((l) => l.building === building && l.floor === floor).map((l) => l.room))];
  const detailsFor = (building: string, floor: string, room: string) => [...new Set(locs.filter((l) => l.building === building && l.floor === floor && l.room === room).map((l) => l.detail).filter((x): x is string => !!x))];

  const room = (noRoom ? pos : r);
  const detail = (!noRoom && d.trim()) ? d.trim() : null;
  const bt = b.trim(), ft = f.trim(), rt = room.trim();
  const key = (bt && ft && rt) ? `ok|${bt}|${ft}|${rt}|${detail ?? ""}` : "none";
  const isExisting = !!(bt && ft && rt && locs.some((l) => l.building === bt && l.floor === ft && l.room === rt && (l.detail ?? null) === detail));

  useEffect(() => {
    if (locs.length === 0) return; // wait for seed before emitting
    if (bt && ft && rt && (!restrictToExisting || isExisting)) {
      onChange({ kind: "ok", building: bt, floor: ft, room: rt, detail, name: [bt, ft, rt, detail].filter(Boolean).join(" / ") });
    } else {
      onChange({ kind: "none" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locs.length, restrictToExisting]);

  const toggleNoRoom = (v: boolean) => {
    setNoRoom(v);
    setPos("");
  };

  const inputCls = "w-full h-10 bg-card border-input shadow-none";

  return (
    <div className={className ?? "space-y-4"}>
      {/* in-room / no-room segmented tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => toggleNoRoom(false)}
          aria-pressed={!noRoom}
          className={cn("rounded-md py-1.5 text-sm font-medium transition-colors", !noRoom ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          อยู่ในห้อง
        </button>
        <button
          type="button"
          onClick={() => toggleNoRoom(true)}
          aria-pressed={noRoom}
          className={cn("rounded-md py-1.5 text-sm font-medium transition-colors", noRoom ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          ไม่มีห้องเฉพาะ
        </button>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{noRoom ? "ของไม่ได้อยู่ในห้อง — ระบุตำแหน่งแทน" : "เลือก อาคาร → ชั้น → ห้อง"}</p>

      {/* One field per row: these are dropdowns, and a half-width dropdown clips
          long building/room names into an ellipsis you have to open to read. */}
      <div className="grid grid-cols-1 gap-3">
        <Field label="อาคาร">
          <Combobox value={b} onChange={setB} options={buildings} placeholder="เช่น อาคาร 2" className={inputCls} allowCreate={!restrictToExisting} />
        </Field>
        <Field label="ชั้น">
          <Combobox value={f} onChange={setF} options={buildings.includes(b) ? floorsFor(b) : [...new Set(locs.map((l) => l.floor))]} placeholder="เช่น 4" className={inputCls} allowCreate={!restrictToExisting} />
        </Field>

        {noRoom ? (
          <Field label="ตำแหน่ง">
            <Combobox value={pos} onChange={setPos} options={b && f ? roomsFor(b, f) : [...new Set(locs.map((l) => l.room))]} placeholder="เช่น ล็อคเกอร์หน้าห้อง 402" className={inputCls} allowCreate={!restrictToExisting} />
          </Field>
        ) : (
          <>
            <Field label="ห้อง">
              <Combobox value={r} onChange={setR} options={b && f ? roomsFor(b, f) : [...new Set(locs.map((l) => l.room))]} placeholder="เช่น 402" className={inputCls} allowCreate={!restrictToExisting} />
            </Field>
            {detailsFor(b, f, r).length > 0 && (
              <Field label="รายละเอียด">
                <Combobox value={d} onChange={setD} options={detailsFor(b, f, r)} placeholder="ไม่มีรายละเอียด" className={inputCls} allowCreate={!restrictToExisting} />
              </Field>
            )}
          </>
        )}
      </div>

      {bt && ft && rt && (
        isExisting || !restrictToExisting ? (
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0 text-primary" />
            <span className="font-medium text-foreground">{[bt, ft, rt, detail].filter(Boolean).join(" / ")}</span>
          </div>
        ) : (
          <p className="text-xs text-destructive">ไม่พบสถานที่นี้ในระบบ — กรุณาเลือกจากรายการที่มีอยู่</p>
        )
      )}
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

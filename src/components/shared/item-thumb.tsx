import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An item's photo, or an honest blank when it has none.
 *
 * Every one of these used to fall back to `pic(code)` — a random Lorem Picsum photo seeded
 * off the item code. It filled the layout nicely and it was a lie: staff picking stock off
 * the /dispense and /cart cards were choosing by a photograph of something else entirely,
 * and a stable seed made the same wrong picture show up every time, which is exactly what
 * makes it believable. A grey box with a parcel icon says "no photo yet" and cannot mislead.
 *
 * Sizing comes from the parent — every call site already wraps this in a fixed box with
 * `overflow-hidden` and a radius, so both branches just fill it.
 */
export function ItemThumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (src) {
    return <img src={src} alt={alt} loading="lazy" className={cn("size-full object-cover", className)} />;
  }
  return (
    <div
      role="img"
      aria-label={`${alt} — ไม่มีรูป`}
      className={cn("size-full grid place-items-center bg-muted text-muted-foreground/40", className)}
    >
      <Package className="size-[38%]" />
    </div>
  );
}

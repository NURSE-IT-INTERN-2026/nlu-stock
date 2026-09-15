import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { withBase } from "@/lib/base-path";

/**
 * An item's photo, or an honest blank when it has none.
 *
 * Never fall back to a placeholder photo: staff pick stock off the /dispense and /cart cards by
 * the picture, so a photo of something else misleads. A grey box with a parcel icon says
 * "no photo yet" and cannot.
 *
 * Sizing comes from the parent — every call site already wraps this in a fixed box with
 * `overflow-hidden` and a radius, so both branches just fill it.
 */
export function ItemThumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (src) {
    return <img src={withBase(src)} alt={alt} loading="lazy" className={cn("size-full object-cover", className)} />;
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

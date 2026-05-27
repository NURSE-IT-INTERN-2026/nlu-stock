"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="text-2xl font-bold text-destructive">เกิดข้อผิดพลาด</div>
      <p className="text-muted-foreground max-w-md">
        {error.message || "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่"}
      </p>
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        ลองใหม่
      </button>
    </div>
  );
}

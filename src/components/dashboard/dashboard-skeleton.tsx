import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-[320px] w-full rounded-2xl" />
      <Skeleton className="h-[320px] w-full rounded-2xl" />
    </div>
  );
}

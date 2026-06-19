import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[250px] w-full rounded-lg" />
        <Skeleton className="h-[250px] w-full rounded-lg" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Skeleton className="h-[280px] w-full rounded-lg" />
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <Skeleton className="h-8 w-64" />

      {/* Metric cards + status overview */}
      <div className="grid gap-4 lg:grid-cols-5 items-stretch">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="lg:col-span-2 h-[280px] rounded-lg" />
        <Skeleton className="lg:col-span-2 h-[280px] rounded-lg" />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
      </div>
    </div>
  );
}

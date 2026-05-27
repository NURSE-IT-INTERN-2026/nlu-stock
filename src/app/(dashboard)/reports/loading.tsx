import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Skeleton className="h-10 w-full rounded-md" />
      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-24" />
      </div>
      {/* Table area */}
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  );
}

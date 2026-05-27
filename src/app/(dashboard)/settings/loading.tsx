import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Skeleton className="h-10 w-full rounded-md" />
      {/* Search + actions bar */}
      <div className="flex justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      {/* Table */}
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  );
}

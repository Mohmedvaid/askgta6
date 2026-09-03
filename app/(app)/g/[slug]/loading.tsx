import { SkeletonList } from "@/components/Skeleton";

export default function GroupLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading the group">
      <div className="animate-pulse rounded-lg border border-border bg-surface-1 p-6">
        <div className="h-7 w-48 rounded-md bg-surface-2" />
        <div className="mt-3 h-3 w-32 rounded-sm bg-surface-2" />
      </div>
      <SkeletonList count={3} />
    </div>
  );
}

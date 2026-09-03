import { SkeletonList } from "@/components/Skeleton";

export default function FeedLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading the feed">
      <div>
        <div className="h-9 w-40 rounded-md bg-surface-2" />
        <div className="mt-3 h-4 w-72 max-w-full rounded-sm bg-surface-2" />
      </div>
      <div className="space-y-6">
        <div className="h-8 w-64 max-w-full rounded-md bg-surface-2" />
        <div className="h-8 w-full max-w-md rounded-md bg-surface-2" />
      </div>
      <SkeletonList count={3} />
    </div>
  );
}

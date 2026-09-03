/**
 * Loading placeholders. They match the real layout closely enough that nothing
 * moves when the content arrives, which is the only reason to have them.
 */
export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="h-3 rounded-sm bg-surface-2" style={{ width }} />;
}

export function SkeletonCard() {
  return (
    <div className="border-b border-border py-5">
      <SkeletonLine width="30%" />
      <div className="mt-4 space-y-2.5">
        <SkeletonLine width="80%" />
        <SkeletonLine width="55%" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

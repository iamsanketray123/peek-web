export default function AppsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 animate-in fade-in duration-300">
      {/* App header skeleton */}
      <div className="mb-6 flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-surface-3 animate-pulse" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-48 rounded-lg bg-surface-3 animate-pulse" />
          <div className="h-3 w-32 rounded-lg bg-surface-3/60 animate-pulse" />
          <div className="mt-1.5 flex gap-3">
            <div className="h-3 w-16 rounded bg-surface-3/40 animate-pulse" />
            <div className="h-3 w-20 rounded bg-surface-3/40 animate-pulse" />
            <div className="h-3 w-12 rounded bg-surface-3/40 animate-pulse" />
          </div>
        </div>
        <div className="h-10 w-24 rounded-xl bg-surface-3/50 animate-pulse" />
      </div>

      {/* Tabs skeleton */}
      <div className="mb-5 flex gap-1 border-b border-line">
        <div className="px-4 py-2.5 border-b-2 border-lime">
          <div className="h-4 w-16 rounded bg-lime/20" />
        </div>
        <div className="px-4 py-2.5 border-b-2 border-transparent">
          <div className="h-4 w-24 rounded bg-surface-3/40 animate-pulse" />
        </div>
      </div>

      {/* Search bar skeleton */}
      <div className="mb-5 flex gap-2">
        <div className="flex-1 h-11 rounded-xl bg-surface-3/30 border border-line animate-pulse" />
        <div className="h-11 w-20 rounded-xl bg-lime/20 animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface/20">
        {/* Header */}
        <div className="flex border-b border-line bg-surface/85 px-5 py-3.5 gap-4">
          <div className="h-3 w-16 rounded bg-surface-3/50 animate-pulse" />
          <div className="h-3 w-14 rounded bg-surface-3/50 animate-pulse ml-auto" />
          <div className="h-3 w-16 rounded bg-surface-3/50 animate-pulse" />
          <div className="h-3 w-16 rounded bg-surface-3/50 animate-pulse" />
          <div className="h-3 w-10 rounded bg-surface-3/50 animate-pulse" />
        </div>
        {/* Rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center border-b border-line/40 px-5 py-4 gap-4"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            <div className="h-3.5 rounded bg-surface-3/40 animate-pulse" style={{ width: `${100 + (i % 3) * 30}px` }} />
            <div className="h-3.5 w-10 rounded bg-surface-3/30 animate-pulse ml-auto" />
            <div className="h-2 w-20 rounded-full bg-surface-3/30 animate-pulse" />
            <div className="h-2 w-24 rounded-full bg-surface-3/30 animate-pulse" />
            <div className="h-3 w-12 rounded bg-surface-3/20 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

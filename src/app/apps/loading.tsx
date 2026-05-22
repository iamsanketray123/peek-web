export default function AppsIndexLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 animate-in fade-in duration-300">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 rounded-lg bg-surface-3 animate-pulse" />
        <div className="h-3 w-64 rounded bg-surface-3/40 animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-line bg-surface/30 p-4"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            <div className="h-12 w-12 shrink-0 rounded-xl bg-surface-3 animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-surface-3/50 animate-pulse" />
              <div className="h-3 w-24 rounded bg-surface-3/30 animate-pulse" />
            </div>
            <div className="h-3 w-8 rounded bg-surface-3/30 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

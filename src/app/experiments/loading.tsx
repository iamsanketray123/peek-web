export default function Loading() {
  return (
    <div
      className="mx-auto max-w-7xl space-y-6 p-8"
      role="status"
      aria-label="Loading experiments"
    >
      <div className="h-12 w-2/3 rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-32 rounded-2xl border border-line bg-surface"
          />
        ))}
      </div>
      <div className="h-80 rounded-2xl border border-line bg-surface" />
      <span className="sr-only">Loading experiment workspace</span>
    </div>
  );
}

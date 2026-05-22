/** Inline mini bar for popularity/difficulty (appkittie-style). */
export function MetricBar({
  value,
  max = 100,
  tone = "neutral",
}: {
  value: number | null | undefined;
  max?: number;
  tone?: "pop" | "diff" | "neutral";
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  // Difficulty: green (easy) -> yellow -> red (hard). Popularity: lime fill.
  let color = "var(--color-lime)";
  if (tone === "diff") {
    if (value != null && value >= 65) color = "#f87171";
    else if (value != null && value >= 40) color = "#facc15";
    else color = "#4ade80";
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums">
        {value == null ? "—" : Math.round(value)}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

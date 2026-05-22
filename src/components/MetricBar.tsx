"use client";

import { useEffect, useState } from "react";

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
  const [widthPct, setWidthPct] = useState(0);
  const targetPct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  useEffect(() => {
    // Trigger transition after render mount
    const frame = requestAnimationFrame(() => {
      setWidthPct(targetPct);
    });
    return () => cancelAnimationFrame(frame);
  }, [targetPct]);

  // Difficulty: green (easy) -> yellow -> red (hard). Popularity: lime fill.
  let color = "var(--color-lime)";
  if (tone === "diff") {
    if (value != null && value >= 65) color = "#f87171";
    else if (value != null && value >= 40) color = "#facc15";
    else color = "#4ade80";
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums text-white">
        {value == null ? "—" : Math.round(value)}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3 border border-line/10">
        <div 
          className="h-full rounded-full" 
          style={{ 
            width: `${widthPct}%`, 
            background: color,
            transition: "width 0.85s cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow: tone === "pop" && value && value > 50 ? "0 0 8px var(--color-lime)" : "none"
          }} 
        />
      </div>
    </div>
  );
}

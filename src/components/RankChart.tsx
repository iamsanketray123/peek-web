"use client";

import type { RankPointDTO } from "@/app/actions/apps";

/**
 * Inline SVG line chart of rank position over time. The Y axis is inverted —
 * rank #1 (best) sits at the top. Points where the app wasn't ranked (null)
 * break the line into segments.
 */
export default function RankChart({
  history,
  width = 72,
  height = 26,
  showAxis = false,
}: {
  history: RankPointDTO[];
  width?: number;
  height?: number;
  showAxis?: boolean;
}) {
  const pad = showAxis ? 14 : 3;
  const ranked = history.filter((h) => h.position != null) as { position: number; checkedAt: string }[];

  if (ranked.length === 0) {
    return <span className="text-xs text-faint">—</span>;
  }

  const positions = ranked.map((r) => r.position);
  const minRank = Math.min(...positions);
  const maxRank = Math.max(...positions);
  const span = maxRank - minRank || 1;

  const n = history.length;
  const xStep = n > 1 ? (width - pad * 2) / (n - 1) : 0;

  // Map a position to a Y coordinate (rank 1 at top → small y).
  const yOf = (p: number) =>
    pad + ((p - minRank) / span) * (height - pad * 2);
  const xOf = (i: number) => (n > 1 ? pad + i * xStep : width / 2);

  // Build line segments, breaking on null (not-ranked) gaps.
  const segments: string[] = [];
  let current: string[] = [];
  history.forEach((h, i) => {
    if (h.position == null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${xOf(i).toFixed(1)},${yOf(h.position).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showAxis && (
        <>
          <text x={2} y={pad + 3} className="fill-faint" fontSize="9">
            #{minRank}
          </text>
          <text x={2} y={height - pad + 3} className="fill-faint" fontSize="9">
            #{maxRank}
          </text>
        </>
      )}
      {segments.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="var(--color-lime)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {history.map((h, i) =>
        h.position == null ? null : (
          <circle
            key={i}
            cx={xOf(i)}
            cy={yOf(h.position)}
            r={showAxis ? 2.5 : 1.6}
            fill="var(--color-lime)"
          />
        ),
      )}
    </svg>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, X } from "lucide-react";
import Image from "next/image";
import {
  getAppKeywordTrend,
  type AppTrendPointDTO,
  type CompetitorAppDTO,
} from "@/app/actions/apps";

const COMPETITOR_COLORS = [
  "#38bdf8", // Sky blue
  "#c084fc", // Purple
  "#f472b6", // Pink
  "#34d399", // Emerald
  "#fb7185", // Rose
];

export default function AppKeywordTrendPanel({
  appKeywordId,
  term,
  onClose,
  competitors = [],
  appName,
  appIconUrl,
}: {
  appKeywordId: string;
  term: string;
  onClose: () => void;
  competitors: CompetitorAppDTO[];
  appName: string;
  appIconUrl: string | null;
}) {
  const [data, setData] = useState<AppTrendPointDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fetchTrend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trend = await getAppKeywordTrend(appKeywordId);
      setData(trend);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appKeywordId]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 animate-fade-in">
        <Loader2 size={20} className="animate-spin text-lime" />
        <span className="ml-2 text-xs text-muted">Loading rank history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade-in">
        {error}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface/40 px-4 py-8 text-center text-sm text-muted animate-fade-in">
        <p className="font-medium text-white mb-1">No rank history yet</p>
        <p>Ranks are checked daily. Relaunch a check or refresh to build history.</p>
      </div>
    );
  }

  // ── Chart constants ──
  const LAST_N = 15;
  const points = data.slice(-LAST_N);
  const chartW = 380;
  const chartH = 160;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const n = points.length;

  // Find min and max ranks in the shown points to scale the Y axis
  let minRank = 200;
  let maxRank = 1;
  let hasAnyRank = false;

  points.forEach((p) => {
    if (p.position != null) {
      minRank = Math.min(minRank, p.position);
      maxRank = Math.max(maxRank, p.position);
      hasAnyRank = true;
    }
    Object.values(p.competitors).forEach((pos) => {
      if (pos != null) {
        minRank = Math.min(minRank, pos);
        maxRank = Math.max(maxRank, pos);
        hasAnyRank = true;
      }
    });
  });

  // Default range if no ranks recorded
  if (!hasAnyRank) {
    minRank = 1;
    maxRank = 100;
  } else {
    // Add some padding to top/bottom of the chart so lines don't touch the edges
    const range = maxRank - minRank;
    const padding = Math.max(1, Math.round(range * 0.1));
    minRank = Math.max(1, Math.round(minRank - padding));
    maxRank = Math.round(maxRank + padding);
  }

  const span = maxRank - minRank || 1;

  function toX(i: number) {
    if (n <= 1) return padL + innerW / 2;
    return padL + (i / (n - 1)) * innerW;
  }

  // Map a position to a Y coordinate (rank 1 / best at top → small y).
  function toY(v: number | null) {
    if (v == null) return null;
    return padT + ((v - minRank) / span) * innerH;
  }

  // Build line segments, breaking on null (not-ranked) gaps.
  function buildLineSegments(key: "main" | string) {
    const segments: string[][] = [];
    let current: string[] = [];

    points.forEach((p, i) => {
      const pos = key === "main" ? p.position : (p.competitors[key] ?? null);
      const y = toY(pos);
      if (y == null) {
        if (current.length) {
          segments.push(current);
          current = [];
        }
      } else {
        current.push(`${toX(i).toFixed(1)},${y.toFixed(1)}`);
      }
    });
    if (current.length) {
      segments.push(current);
    }
    return segments;
  }

  const mainSegments = buildLineSegments("main");
  const compSegmentsList = competitors.map((c) => ({
    appleId: c.appleId,
    name: c.name,
    segments: buildLineSegments(c.appleId),
  }));

  // Format date label
  function fmtDate(iso: string) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function fmtDateFull(iso: string) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Y-axis labels: 3 points (min, mid, max)
  const midRank = Math.round((minRank + maxRank) / 2);
  const yLabels = [minRank, midRank, maxRank];

  // X-axis labels: show first, last, and middle
  const xLabelIndices: number[] = [];
  if (n >= 1) xLabelIndices.push(0);
  if (n >= 3) xLabelIndices.push(Math.floor(n / 2));
  if (n >= 2) xLabelIndices.push(n - 1);

  // History table: most recent first
  const historyPoints = [...points].reverse();

  return (
    <div className="animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-line/30 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-faint">
            Rank History:
          </span>
          <span className="text-sm font-semibold text-lime font-mono">
            {term}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-faint hover:bg-surface-3 hover:text-white transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Chart ── */}
        <div className="flex-1 min-w-0 rounded-xl border border-line bg-surface-2/50 p-3 backdrop-blur-sm">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-auto"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* Grid lines */}
            {yLabels.map((v) => {
              const y = toY(v)!;
              return (
                <g key={v}>
                  <line
                    x1={padL}
                    x2={chartW - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--color-line)"
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                    opacity={0.6}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--color-faint)"
                    fontSize={8}
                    fontFamily="var(--font-mono)"
                  >
                    #{v}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {xLabelIndices.map((i) => (
              <text
                key={i}
                x={toX(i)}
                y={chartH - 4}
                textAnchor="middle"
                fill="var(--color-faint)"
                fontSize={7.5}
                fontFamily="var(--font-mono)"
              >
                {fmtDate(points[i].date)}
              </text>
            ))}

            {/* Competitor lines */}
            {compSegmentsList.map(({ segments, appleId }, idx) => {
              const color = COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length];
              return segments.map((pts, i) => (
                <polyline
                  key={`${appleId}-${i}`}
                  points={pts.join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.8}
                />
              ));
            })}

            {/* Main App line (lime) */}
            {mainSegments.map((pts, i) => (
              <polyline
                key={`main-${i}`}
                points={pts.join(" ")}
                fill="none"
                stroke="var(--color-lime)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
            ))}

            {/* Competitor point markers */}
            {compSegmentsList.map(({ appleId }, idx) => {
              const color = COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length];
              return points.map((p, i) => {
                const pos = p.competitors[appleId] ?? null;
                const y = toY(pos);
                if (y == null) return null;
                return (
                  <circle
                    key={`comp-mark-${appleId}-${i}`}
                    cx={toX(i)}
                    cy={y}
                    r={hoverIdx === i ? 3.5 : 2}
                    fill={color}
                    stroke="var(--color-surface)"
                    strokeWidth={0.75}
                    className="transition-all duration-150"
                  />
                );
              });
            })}

            {/* Main App point markers */}
            {points.map((p, i) => {
              const y = toY(p.position);
              if (y == null) return null;
              return (
                <circle
                  key={`main-mark-${i}`}
                  cx={toX(i)}
                  cy={y}
                  r={hoverIdx === i ? 4.5 : 2.5}
                  fill="var(--color-lime)"
                  stroke="var(--color-surface)"
                  strokeWidth={1}
                  className="transition-all duration-150"
                />
              );
            })}

            {/* Invisible hover zones for each data point */}
            {points.map((_, i) => (
              <rect
                key={`hover-${i}`}
                x={toX(i) - (n <= 1 ? innerW / 2 : innerW / (n - 1) / 2)}
                y={padT}
                width={n <= 1 ? innerW : innerW / (n - 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            ))}

            {/* Hover vertical line + tooltip */}
            {hoverIdx != null && (
              <>
                <line
                  x1={toX(hoverIdx)}
                  x2={toX(hoverIdx)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke="var(--color-faint)"
                  strokeWidth={0.75}
                  strokeDasharray="2 2"
                  opacity={0.5}
                />
                {/* Dynamic Height Tooltip */}
                <g>
                  {/* Tooltip background */}
                  <rect
                    x={Math.min(toX(hoverIdx) - 50, chartW - padR - 100)}
                    y={2}
                    width={100}
                    height={32 + 10 * (1 + competitors.filter(c => points[hoverIdx].competitors[c.appleId] != null).length)}
                    rx={5}
                    fill="var(--color-surface)"
                    stroke="var(--color-line)"
                    strokeWidth={0.5}
                    opacity={0.96}
                  />
                  {/* Date label */}
                  <text
                    x={Math.min(toX(hoverIdx), chartW - padR - 50)}
                    y={11}
                    textAnchor="middle"
                    fill="var(--color-muted)"
                    fontSize={7.5}
                    fontWeight="bold"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtDate(points[hoverIdx].date)}
                  </text>
                  {/* Main app rank */}
                  <text
                    x={Math.min(toX(hoverIdx) - 44, chartW - padR - 94)}
                    y={22}
                    fill="var(--color-lime)"
                    fontSize={7.5}
                    fontWeight="semibold"
                  >
                    • Us: #{points[hoverIdx].position ?? "—"}
                  </text>
                  {/* Competitor ranks */}
                  {competitors.map((comp, idx) => {
                    const pos = points[hoverIdx].competitors[comp.appleId] ?? null;
                    if (pos == null) return null;
                    const color = COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length];
                    const compShortName = comp.name.split(" ")[0].slice(0, 10);
                    return (
                      <text
                        key={comp.id}
                        x={Math.min(toX(hoverIdx) - 44, chartW - padR - 94)}
                        y={22 + 10 * (idx + 1)}
                        fill={color}
                        fontSize={7.5}
                      >
                        • {compShortName}: #{pos}
                      </text>
                    );
                  })}
                </g>
              </>
            )}
          </svg>

          {/* Legends */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2 border-t border-line/30 pt-2">
            <span className="flex items-center gap-1.5 text-[9px] text-white font-medium">
              <span className="inline-block h-[3px] w-3 rounded-full bg-lime" />
              Us ({appName.split(":")[0]})
            </span>
            {competitors.map((c, idx) => (
              <span key={c.id} className="flex items-center gap-1.5 text-[9px] text-muted">
                <span
                  className="inline-block h-[3px] w-3 rounded-full"
                  style={{ backgroundColor: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length] }}
                />
                {c.name.split(":")[0].split(" ")[0]}
              </span>
            ))}
          </div>
        </div>

        {/* ── History Table ── */}
        <div className="lg:w-[260px] shrink-0 rounded-xl border border-line bg-surface-2/50 overflow-hidden backdrop-blur-sm">
          <div className="border-b border-line px-3 py-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-faint">
              Ranks History
            </h4>
          </div>
          <div className="max-h-[190px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-line/50 bg-surface/50 text-faint">
                  <th className="px-2.5 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-2 py-1.5 text-right font-semibold text-lime">Us</th>
                  {competitors.map((c, idx) => (
                    <th
                      key={c.id}
                      className="px-2 py-1.5 text-right font-semibold truncate max-w-[50px]"
                      title={c.name}
                      style={{ color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length] }}
                    >
                      {c.name.split(" ")[0].slice(0, 5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {historyPoints.map((p, i) => (
                  <tr
                    key={p.date}
                    className={`transition-colors ${i === 0 ? "bg-lime/5" : "hover:bg-surface/40"}`}
                  >
                    <td className="px-2.5 py-1.5 font-mono text-white/80">
                      {fmtDateFull(p.date)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-lime">
                      {p.position ? `#${p.position}` : "—"}
                    </td>
                    {competitors.map((c) => {
                      const pos = p.competitors[c.appleId] ?? null;
                      return (
                        <td key={c.id} className="px-2 py-1.5 text-right font-mono text-white/70">
                          {pos ? `#${pos}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

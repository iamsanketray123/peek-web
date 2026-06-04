"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, X } from "lucide-react";
import {
  getKeywordTrend,
  type TrendPointDTO,
} from "@/app/actions/keywords";

/**
 * KeywordTrendPanel — Expandable trend chart + history table for a saved keyword.
 *
 * Shows a dual-line SVG chart (Popularity + Difficulty over time) and a scrollable
 * history table with per-date values, matching the appkittie/respectaso reference.
 */
export default function KeywordTrendPanel({
  savedKeywordId,
  term,
  onClose,
}: {
  savedKeywordId: string;
  term: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TrendPointDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fetchTrend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trend = await getKeywordTrend(savedKeywordId);
      setData(trend);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [savedKeywordId]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 animate-fade-in">
        <Loader2 size={20} className="animate-spin text-lime" />
        <span className="ml-2 text-xs text-muted">Loading trend data…</span>
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
        <p className="font-medium text-white mb-1">No trend data yet</p>
        <p>Search this keyword again tomorrow to start building trend history.</p>
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
  const minVal = 0;
  const maxVal = 100;

  function toX(i: number) {
    if (n <= 1) return padL + innerW / 2;
    return padL + (i / (n - 1)) * innerW;
  }
  function toY(v: number | null) {
    if (v == null) return null;
    const clamped = Math.max(minVal, Math.min(maxVal, v));
    return padT + innerH - ((clamped - minVal) / (maxVal - minVal)) * innerH;
  }

  // Build polyline paths
  function buildPath(key: "popularity" | "difficulty") {
    const coords: string[] = [];
    for (let i = 0; i < n; i++) {
      const v = points[i][key];
      const y = toY(v);
      if (y != null) coords.push(`${toX(i)},${y}`);
    }
    return coords.join(" ");
  }

  const popPath = buildPath("popularity");
  const diffPath = buildPath("difficulty");

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

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis labels: show first, last, and middle
  const xLabelIndices: number[] = [];
  if (n >= 1) xLabelIndices.push(0);
  if (n >= 3) xLabelIndices.push(Math.floor(n / 2));
  if (n >= 2) xLabelIndices.push(n - 1);

  // History table: most recent first
  const historyPoints = [...points].reverse();

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-faint">
          Trend (Last {points.length} Data Points)
        </h3>
        <button
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
                    {v}
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

            {/* Popularity line (lime) */}
            {popPath && (
              <polyline
                points={popPath}
                fill="none"
                stroke="var(--color-lime)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
            )}

            {/* Difficulty line (orange) */}
            {diffPath && (
              <polyline
                points={diffPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
            )}

            {/* Data point markers — Popularity */}
            {points.map((p, i) => {
              const y = toY(p.popularity);
              if (y == null) return null;
              return (
                <circle
                  key={`pop-${i}`}
                  cx={toX(i)}
                  cy={y}
                  r={hoverIdx === i ? 4 : 2.5}
                  fill="var(--color-lime)"
                  stroke="var(--color-surface)"
                  strokeWidth={1}
                  className="transition-all duration-150"
                />
              );
            })}

            {/* Data point markers — Difficulty */}
            {points.map((p, i) => {
              const y = toY(p.difficulty);
              if (y == null) return null;
              return (
                <circle
                  key={`diff-${i}`}
                  cx={toX(i)}
                  cy={y}
                  r={hoverIdx === i ? 4 : 2.5}
                  fill="#f59e0b"
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
                {/* Tooltip background */}
                <rect
                  x={Math.min(toX(hoverIdx) - 42, chartW - padR - 84)}
                  y={2}
                  width={84}
                  height={36}
                  rx={4}
                  fill="var(--color-surface)"
                  stroke="var(--color-line)"
                  strokeWidth={0.5}
                  opacity={0.95}
                />
                <text
                  x={Math.min(toX(hoverIdx), chartW - padR - 42)}
                  y={13}
                  textAnchor="middle"
                  fill="var(--color-muted)"
                  fontSize={7}
                  fontFamily="var(--font-mono)"
                >
                  {fmtDate(points[hoverIdx].date)}
                </text>
                <text
                  x={Math.min(toX(hoverIdx) - 18, chartW - padR - 60)}
                  y={25}
                  fill="var(--color-lime)"
                  fontSize={8}
                  fontWeight="bold"
                  fontFamily="var(--font-mono)"
                >
                  Pop {points[hoverIdx].popularity ?? "—"}
                </text>
                <text
                  x={Math.min(toX(hoverIdx) + 14, chartW - padR - 28)}
                  y={25}
                  fill="#f59e0b"
                  fontSize={8}
                  fontWeight="bold"
                  fontFamily="var(--font-mono)"
                >
                  Diff {points[hoverIdx].difficulty ?? "—"}
                </text>
              </>
            )}
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 mt-1">
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              <span className="inline-block h-[3px] w-4 rounded-full bg-lime" />
              Popularity
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              <span className="inline-block h-[3px] w-4 rounded-full bg-amber-500" />
              Difficulty
            </span>
          </div>
        </div>

        {/* ── History Table ── */}
        <div className="lg:w-[240px] shrink-0 rounded-xl border border-line bg-surface-2/50 overflow-hidden backdrop-blur-sm">
          <div className="border-b border-line px-3 py-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-faint">
              History
            </h4>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-line/50 bg-surface/50 text-faint">
                  <th className="px-3 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Pop</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {historyPoints.map((p, i) => (
                  <tr
                    key={p.date}
                    className={`transition-colors ${i === 0 ? "bg-lime/5" : "hover:bg-surface/40"}`}
                  >
                    <td className="px-3 py-1.5 font-mono text-white/80">
                      {fmtDateFull(p.date)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-lime">
                      {p.popularity ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-400">
                      {p.difficulty ?? "—"}
                    </td>
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

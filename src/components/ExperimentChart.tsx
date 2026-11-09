"use client";

import { useId } from "react";
import {
  addDays,
  dailyRanks,
  daysBetween,
  type Experiment,
  type ExperimentWorkspace,
} from "@/lib/experiments";

export default function ExperimentChart({
  data,
  experiment,
  keyword,
  metric,
}: {
  data: ExperimentWorkspace;
  experiment: Experiment;
  keyword: string;
  metric: "rank" | "downloads";
}) {
  const id = useId();
  const days = daysBetween(experiment.baselineStart, experiment.endDate);
  const start = Date.parse(experiment.baselineStart),
    end = Date.parse(experiment.endDate);
  const x = (day: string) =>
    55 + ((Date.parse(day) - start) / Math.max(86400000, end - start)) * 800;
  const ranks = new Map(
    dailyRanks(
      data.keywords.find((k) => k.term === keyword)?.history ?? [],
    ).map((p) => [p.date, p.position]),
  );
  const acquisition = new Map(data.acquisition.map((a) => [a.date, a]));
  const series =
    metric === "rank"
      ? [
          {
            label: keyword || "Keyword",
            color: "var(--color-lime)",
            dash: undefined,
            values: days.map((d) => ranks.get(d) ?? null),
          },
        ]
      : [
          {
            label: "App Store Search",
            color: "var(--color-lime)",
            dash: undefined,
            values: days.map(
              (d) => acquisition.get(d)?.searchDownloads ?? null,
            ),
          },
          {
            label: "Web referrals",
            color: "#fbbf24",
            dash: "6 4",
            values: days.map((d) => acquisition.get(d)?.webReferrals ?? null),
          },
          {
            label: "App referrals",
            color: "#7dd3fc",
            dash: "2 4",
            values: days.map((d) => acquisition.get(d)?.appReferrals ?? null),
          },
          {
            label: "App Store Browse",
            color: "#c4b5fd",
            dash: "10 3 2 3",
            values: days.map(
              (d) => acquisition.get(d)?.browseDownloads ?? null,
            ),
          },
        ];
  const max =
    metric === "rank"
      ? 200
      : Math.max(
          5,
          ...series.flatMap((s) =>
            s.values.filter((v): v is number => v != null),
          ),
        );
  const y = (value: number) =>
    metric === "rank"
      ? 30 + ((value - 1) / 199) * 170
      : 200 - (value / max) * 170;
  const hasData = series.some((s) => s.values.some((v) => v != null));
  const ticks =
    metric === "rank" ? [1, 100, 200] : [0, Math.round(max / 2), max];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <svg width="22" height="6" aria-hidden="true">
              <line
                x1="0"
                x2="22"
                y1="3"
                y2="3"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dash}
              />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400/40" />
          Promotion + cooldown
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-300/30" />
          Confirmed quiet
        </span>
      </div>
      <svg
        viewBox="0 0 900 250"
        role="img"
        aria-labelledby={id}
        className="w-full rounded-xl border border-line bg-ink/40"
      >
        <title id={id}>
          {metric === "rank"
            ? `iTunes proxy position for ${keyword}. Position 1 is at the top.`
            : "Manually imported first-time downloads by acquisition source."}{" "}
          Missing data breaks the line. Shaded windows are user-reported.
        </title>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x="55" y="22" width="800" height="185" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          {data.events
            .filter((e) => e.kind !== "metadata")
            .map((e) => {
              const right =
                e.kind === "promotion"
                  ? addDays(e.endDate, e.cooldownDays + 1)
                  : addDays(e.endDate, 1);
              return (
                <rect
                  key={e.id}
                  x={x(e.startDate)}
                  y="22"
                  width={Math.max(2, x(right) - x(e.startDate))}
                  height="185"
                  fill={e.kind === "promotion" ? "#fbbf24" : "#7dd3fc"}
                  opacity={e.kind === "promotion" ? 0.12 : 0.065}
                >
                  <title>
                    {e.title}: {e.startDate}–{right}{" "}
                    {e.kind === "promotion" ? "(includes cooldown)" : ""}
                  </title>
                </rect>
              );
            })}
        </g>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1="55"
              y1={y(t)}
              x2="855"
              y2={y(t)}
              stroke="var(--color-line)"
              strokeDasharray="3 5"
            />
            <text
              x="42"
              y={y(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-muted)"
            >
              {metric === "rank" ? `#${t}` : t}
            </text>
          </g>
        ))}
        <line
          x1={x(experiment.startDate)}
          y1="22"
          x2={x(experiment.startDate)}
          y2="207"
          stroke="var(--color-lime)"
          strokeDasharray="5 4"
        />
        <text
          x={Math.min(790, Math.max(55, x(experiment.startDate) + 7))}
          y="15"
          fontSize="10"
          fill="var(--color-lime)"
        >
          Metadata change
        </text>
        <g clipPath={`url(#${id}-clip)`}>
          {data.events
            .filter((e) => e.kind === "metadata")
            .map((e) => (
              <line
                key={e.id}
                x1={x(e.startDate)}
                y1="22"
                x2={x(e.startDate)}
                y2="207"
                stroke="#c4b5fd"
                strokeDasharray="2 5"
              >
                <title>{e.title}</title>
              </line>
            ))}
          {series.map((s) => {
            const segments: string[][] = [];
            let segment: string[] = [];
            s.values.forEach((v, i) => {
              if (v == null) {
                if (segment.length) segments.push(segment);
                segment = [];
              } else segment.push(`${x(days[i])},${y(v)}`);
            });
            if (segment.length) segments.push(segment);
            return (
              <g key={s.label}>
                {segments.map((pts, i) => (
                  <polyline
                    key={i}
                    points={pts.join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeDasharray={s.dash}
                  />
                ))}
                {s.values.map((v, i) =>
                  v == null ? null : (
                    <circle
                      key={days[i]}
                      cx={x(days[i])}
                      cy={y(v)}
                      r="3"
                      fill={s.color}
                      tabIndex={0}
                      aria-label={`${days[i]}: ${s.label} ${v}`}
                    >
                      <title>
                        {days[i]} · {s.label}: {metric === "rank" ? "#" : ""}
                        {v}
                      </title>
                    </circle>
                  ),
                )}
              </g>
            );
          })}
        </g>
        {!hasData && (
          <text
            x="455"
            y="115"
            textAnchor="middle"
            fill="var(--color-muted)"
            fontSize="13"
          >
            {metric === "rank"
              ? "No ranked observations in this window yet"
              : "Import download data to see this chart"}
          </text>
        )}
        {[days[0], days[Math.floor(days.length / 2)], days[days.length - 1]]
          .filter(Boolean)
          .map((d, i) => (
            <text
              key={i}
              x={x(d)}
              y="232"
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              fontSize="11"
              fill="var(--color-muted)"
            >
              {d.slice(5)}
            </text>
          ))}
      </svg>
      <p className="mt-2 text-xs text-muted">
        {metric === "rank"
          ? "iTunes search proxy · #1 is best · gaps mean no observation or not found, never position zero."
          : "First-time downloads · app/storefront totals, not downloads attributed to this keyword. Search may include Apple Ads."}{" "}
        Dates: UTC. No interpolation.
      </p>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer rounded py-2 focus-visible:outline-2 focus-visible:outline-lime">
          View accessible daily data table
        </summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="p-2">UTC day</th>
                {series.map((s) => (
                  <th className="p-2" key={s.label}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d} className="border-t border-line">
                  <td className="p-2 font-mono">{d}</td>
                  {series.map((s) => (
                    <td key={s.label} className="p-2">
                      {s.values[i] ??
                        (metric === "rank" && ranks.has(d)
                          ? "Not found"
                          : "No data")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

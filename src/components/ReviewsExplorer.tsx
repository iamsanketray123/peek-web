"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Star,
  Search,
  Loader2,
  ExternalLink,
  Megaphone,
  Smartphone,
  MessageSquare,
  Layers,
  Download,
  ChevronDown,
} from "lucide-react";
import { COUNTRIES, compact } from "@/lib/format";
import type { Review, ReviewedApp, ReviewSummary } from "@/lib/aso/reviews";
import type { AdLibraryLink } from "@/lib/aso/ads";
import type { TrackedAppDTO } from "@/app/actions/apps";

interface ReviewsResult {
  app: ReviewedApp;
  reviews: Review[];
  summary: ReviewSummary;
  ads: AdLibraryLink[];
}

type SortKey = "recent" | "critical" | "positive" | "helpful";
type RatingFilter = "all" | 1 | 2 | 3 | 4 | 5;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "critical", label: "Most critical" },
  { key: "positive", label: "Most positive" },
  { key: "helpful", label: "Most helpful" },
];

export default function ReviewsExplorer({
  initialTrackedApps = [],
}: {
  initialTrackedApps?: TrackedAppDTO[];
}) {
  const [input, setInput] = useState("");
  const [country, setCountry] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewsResult | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const abortRef = useRef<AbortController | null>(null);

  async function loadApp(appleId: string, appCountry: string) {
    setInput(appleId);
    setCountry(appCountry);
    await loadQuery(appleId, appCountry);
  }

  async function load(e?: React.FormEvent) {
    e?.preventDefault();
    await loadQuery(input.trim(), country);
  }

  async function loadQuery(q: string, c: string) {
    if (!q) return;

    // Cancel any in-flight request so the user never waits on a stale result.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q, country: c }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data as ReviewsResult);
      setRatingFilter("all");
      setSort("recent");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setResult(null);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  const visible = useMemo(() => {
    if (!result) return [];
    let list = result.reviews;
    if (ratingFilter !== "all") list = list.filter((r) => Math.round(r.rating) === ratingFilter);
    const sorted = [...list];
    switch (sort) {
      case "critical":
        sorted.sort((a, b) => a.rating - b.rating || cmpDate(b, a));
        break;
      case "positive":
        sorted.sort((a, b) => b.rating - a.rating || cmpDate(b, a));
        break;
      case "helpful":
        sorted.sort((a, b) => b.voteCount - a.voteCount || cmpDate(b, a));
        break;
      default:
        sorted.sort((a, b) => cmpDate(b, a));
    }
    return sorted;
  }, [result, ratingFilter, sort]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-muted">
          Read recent App Store reviews for any app, see how sentiment breaks down, and
          jump to where the app advertises.
        </p>
      </header>

      {/* Lookup bar */}
      <form onSubmit={load} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 transition-all duration-200 focus-within:border-lime/80 focus-within:ring-2 focus-within:ring-lime/10">
          <Search size={18} className="text-faint" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste an App Store link or ID, e.g. id389801252"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint text-white"
            autoFocus
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 cursor-pointer text-white"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-surface">
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Load
        </button>
      </form>

      {/* Tracked apps quick-select */}
      {initialTrackedApps.length > 0 && !result && !loading && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Layers size={14} className="text-lime" />
            <span className="text-xs font-semibold text-white">Your tracked apps</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {initialTrackedApps.map((app) => (
              <button
                key={app.id}
                onClick={() => loadApp(app.appleId, app.country)}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-left transition-all duration-150 hover:border-lime/40 hover:bg-surface-2 active:scale-[0.98] cursor-pointer"
              >
                {app.iconUrl ? (
                  <Image
                    src={app.iconUrl}
                    alt=""
                    width={28}
                    height={28}
                    unoptimized
                    className="h-7 w-7 shrink-0 rounded-lg border border-line/40"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line/40 bg-surface-3">
                    <Smartphone size={14} className="text-faint" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="max-w-[140px] truncate text-xs font-medium text-white">{app.name}</p>
                  <p className="text-[10px] text-faint uppercase font-mono">{app.country}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !result && <ReviewsSkeleton />}

      {!result && !error && !loading && (
        <div className="rounded-xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center text-muted">
          <MessageSquare size={28} className="mx-auto mb-3 text-faint" />
          <p className="mb-1 text-sm font-medium text-white">Look up any app&apos;s reviews</p>
          <p className="text-sm">Paste an App Store URL or numeric ID to see recent reviews and sentiment.</p>
        </div>
      )}

      {result && (
        <div className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-50 pointer-events-none" : "animate-fade-in"}`}>
          <AppHeader app={result.app} />
          <AdLibraryRow ads={result.ads} appName={result.app.name} />
          <SentimentPanel
            app={result.app}
            summary={result.summary}
            activeFilter={ratingFilter}
            onSelect={(n) => setRatingFilter(ratingFilter === n ? "all" : n)}
          />

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={ratingFilter === "all"} onClick={() => setRatingFilter("all")}>
                All
              </FilterChip>
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <FilterChip key={n} active={ratingFilter === n} onClick={() => setRatingFilter(n)}>
                  {n}
                  <Star size={11} className="fill-current" />
                  <span className="text-faint">{result.summary.distribution[n]}</span>
                </FilterChip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none transition-all duration-200 focus:border-lime/80 cursor-pointer text-white"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key} className="bg-surface">
                    {s.label}
                  </option>
                ))}
              </select>
              <ExportMenu result={result} />
            </div>
          </div>

          {/* Review list */}
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-12 text-center text-sm text-muted">
              No reviews match this filter.
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </ul>
          )}

          <p className="pb-4 text-center text-xs text-faint">
            Shows up to ~{result.reviews.length} most-recent reviews from the {result.app.country.toUpperCase()} App Store
            (Apple&apos;s public RSS feed). The breakdown reflects recent sentiment, not the app&apos;s lifetime rating.
          </p>
        </div>
      )}
    </div>
  );
}

function cmpDate(a: Review, b: Review): number {
  return new Date(a.updated).getTime() - new Date(b.updated).getTime();
}

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-line"}
        />
      ))}
    </span>
  );
}

function AppHeader({ app }: { app: ReviewedApp }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface/60 p-5">
      {app.icon ? (
        <Image
          src={app.icon}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="h-16 w-16 shrink-0 rounded-2xl border border-line/45 shadow-lg"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line/45 bg-surface-3 shadow-lg">
          <Smartphone size={26} className="text-faint" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold tracking-tight text-white">{app.name}</h2>
        <p className="truncate text-sm text-muted">{app.developer}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-faint">
          <span className="flex items-center gap-1">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            <span className="font-semibold text-white">{app.avgRating ? app.avgRating.toFixed(1) : "—"}</span>
            ({compact(app.ratingCount)})
          </span>
          {app.genre && <span>{app.genre}</span>}
          <span className="rounded border border-line/50 bg-surface-3/50 px-1 py-0.25 font-mono text-[10px] font-bold uppercase text-white">
            {app.country}
          </span>
          {app.url && (
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-lime transition-colors hover:text-lime-dim hover:underline"
            >
              App Store <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function AdLibraryRow({ ads, appName }: { ads: AdLibraryLink[]; appName: string }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-1 flex items-center gap-2">
        <Megaphone size={15} className="text-lime" />
        <h3 className="text-sm font-semibold text-white">Where they advertise</h3>
      </div>
      <p className="mb-4 text-xs text-muted">
        Browse live ad creatives for <span className="text-white">{appName}</span> in each network&apos;s public ad library.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {ads.map((ad) => (
          <a
            key={ad.network}
            href={ad.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col rounded-xl border border-line bg-surface-2/50 p-4 transition-all duration-200 hover:border-lime/40 hover:bg-surface-2 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white group-hover:text-lime transition-colors">
                {ad.label}
              </span>
              <ExternalLink size={13} className="text-faint group-hover:text-lime transition-colors" />
            </div>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">{ad.surfaces}</span>
            <span className="mt-2 text-[11px] leading-relaxed text-muted">{ad.note}</span>
          </a>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-faint">
        No network exposes a free cross-platform ad API — these open the official public libraries, pre-filtered by name.
      </p>
    </section>
  );
}

function SentimentPanel({
  app,
  summary,
  activeFilter,
  onSelect,
}: {
  app: ReviewedApp;
  summary: ReviewSummary;
  activeFilter: RatingFilter;
  onSelect: (n: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const max = Math.max(1, ...([1, 2, 3, 4, 5] as const).map((n) => summary.distribution[n]));
  return (
    <section className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[160px_1fr]">
      {/* Recent average */}
      <div className="flex flex-col items-center justify-center border-b border-line pb-4 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
        <p className="font-mono text-4xl font-semibold tabular-nums text-white">
          {summary.count ? summary.average.toFixed(1) : "—"}
        </p>
        <div className="mt-1.5">
          <Stars rating={summary.average} size={15} />
        </div>
        <p className="mt-2 text-xs text-muted">
          across {summary.count} recent review{summary.count === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 text-[11px] text-faint">
          Lifetime: {app.avgRating ? app.avgRating.toFixed(1) : "—"} ({compact(app.ratingCount)})
        </p>
      </div>

      {/* Distribution bars — each row is tappable to filter */}
      <div className="flex flex-col justify-center gap-1">
        {([5, 4, 3, 2, 1] as const).map((n) => {
          const count = summary.distribution[n];
          const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
          const isActive = activeFilter === n;
          return (
            <button
              key={n}
              onClick={() => onSelect(n)}
              className={[
                "flex items-center gap-2.5 rounded-lg px-2 py-1 text-xs transition-all duration-150 cursor-pointer active:scale-[0.98]",
                isActive
                  ? "bg-lime/10 ring-1 ring-lime/30"
                  : "hover:bg-surface-2/60",
              ].join(" ")}
            >
              <span className={[
                "flex w-7 shrink-0 items-center gap-0.5 font-mono",
                isActive ? "text-lime font-semibold" : "text-faint",
              ].join(" ")}>
                {n}
                <Star size={10} className={isActive ? "fill-lime text-lime" : "fill-amber-400 text-amber-400"} />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={[
                    "h-full rounded-full transition-all duration-500",
                    isActive
                      ? "bg-lime"
                      : "bg-gradient-to-r from-lime/60 to-lime-dim/60",
                  ].join(" ")}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <span className={[
                "w-14 shrink-0 text-right font-mono tabular-nums",
                isActive ? "text-lime font-semibold" : "text-muted",
              ].join(" ")}>
                {count > 0 ? `${pct}% (${count})` : "—"}
              </span>
            </button>
          );
        })}
        {activeFilter !== "all" && (
          <button
            onClick={() => onSelect(activeFilter as 1 | 2 | 3 | 4 | 5)}
            className="mt-1 text-[11px] text-lime/70 hover:text-lime transition-colors cursor-pointer text-right pr-2"
          >
            Clear filter ×
          </button>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer",
        active
          ? "border-lime/40 bg-lime/10 text-lime"
          : "border-line bg-surface text-muted hover:border-line/80 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 transition-colors duration-150 hover:border-line/80">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            {review.title && (
              <span className="truncate text-sm font-semibold text-white">{review.title}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-faint">
            {review.author}
            {review.version && <span> · v{review.version}</span>}
            {review.updated && <span> · {fmtDate(review.updated)}</span>}
          </p>
        </div>
        {review.voteCount > 0 && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-faint" title="Helpful votes">
            {compact(review.voteSum)} helpful
          </span>
        )}
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{review.content}</p>
    </li>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffDays = Math.floor((now - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Export helpers ────────────────────────────────────────────────────────────

function csvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function buildCSV(reviews: Review[]): string {
  const header = ["Rating", "Title", "Body", "Author", "Version", "Date", "Helpful Votes"].join(",");
  const rows = reviews.map((r) =>
    [
      r.rating,
      csvCell(r.title ?? ""),
      csvCell(r.content),
      csvCell(r.author),
      csvCell(r.version ?? ""),
      r.updated ? r.updated.slice(0, 10) : "",
      r.voteSum,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function buildMarkdown(reviews: Review[], app: ReviewedApp, summary: ReviewSummary): string {
  const dist = ([5, 4, 3, 2, 1] as const)
    .map((n) => {
      const pct = summary.count ? Math.round((summary.distribution[n] / summary.count) * 100) : 0;
      return `  - ${n}★: ${summary.distribution[n]} reviews (${pct}%)`;
    })
    .join("\n");

  const header = `# App Store Reviews — ${app.name}

**Developer:** ${app.developer}
**Apple ID:** ${app.appleId}
**Country:** ${app.country.toUpperCase()}
**Lifetime rating:** ${app.avgRating?.toFixed(1) ?? "—"} across ${compact(app.ratingCount)} ratings
**Exported:** ${new Date().toISOString().slice(0, 10)}

## Recent Sentiment (${summary.count} reviews)

**Average:** ${summary.average.toFixed(2)}★

**Distribution:**
${dist}

---

## Reviews

`;

  const blocks = reviews
    .map((r, i) => {
      const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
      const meta = [r.updated?.slice(0, 10), r.version ? `v${r.version}` : null]
        .filter(Boolean)
        .join(" · ");
      const helpful = r.voteSum > 0 ? ` · ${r.voteSum} helpful` : "";
      return `### ${i + 1}. ${stars} ${r.title ?? "(no title)"}
*${r.author}${meta ? ` · ${meta}` : ""}${helpful}*

${r.content}`;
    })
    .join("\n\n---\n\n");

  return header + blocks;
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportMenu({ result }: { result: ReviewsResult }) {
  const [open, setOpen] = useState(false);
  const slug = result.app.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);

  const options = [
    {
      label: "Markdown",
      sub: "Best for Claude / AI",
      glyph: "✦",
      action() {
        triggerDownload(
          `${slug}-reviews-${date}.md`,
          buildMarkdown(result.reviews, result.app, result.summary),
          "text/markdown",
        );
      },
    },
    {
      label: "CSV",
      sub: "Spreadsheet-ready",
      glyph: "⊞",
      action() {
        triggerDownload(`${slug}-reviews-${date}.csv`, buildCSV(result.reviews), "text/csv");
      },
    },
    {
      label: "JSON",
      sub: "Full structured data",
      glyph: "{}",
      action() {
        triggerDownload(
          `${slug}-reviews-${date}.json`,
          JSON.stringify(result, null, 2),
          "application/json",
        );
      },
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-muted transition-all duration-150 hover:border-line/80 hover:text-white active:scale-95 cursor-pointer"
      >
        <Download size={13} />
        Export
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/40">
            {options.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => { opt.action(); setOpen(false); }}
                className={[
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 cursor-pointer",
                  i < options.length - 1 ? "border-b border-line/50" : "",
                ].join(" ")}
              >
                <span className="mt-0.5 w-5 shrink-0 text-center font-mono text-xs text-faint">
                  {opt.glyph}
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">{opt.label}</p>
                  <p className="text-[11px] text-faint">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface/60 p-5">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-surface-3" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-5 w-1/3 rounded bg-surface-3" />
          <div className="h-3 w-1/4 rounded bg-surface-3" />
          <div className="h-3 w-1/2 rounded bg-surface-3" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-44 rounded-2xl border border-line bg-surface" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
          <div className="h-4 w-1/4 rounded bg-surface-3" />
          <div className="h-3 w-full rounded bg-surface-3" />
          <div className="h-3 w-2/3 rounded bg-surface-3" />
        </div>
      ))}
    </div>
  );
}

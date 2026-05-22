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
} from "lucide-react";
import { COUNTRIES, compact } from "@/lib/format";
import type { Review, ReviewedApp, ReviewSummary } from "@/lib/aso/reviews";
import type { AdLibraryLink } from "@/lib/aso/ads";

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

export default function ReviewsExplorer() {
  const [input, setInput] = useState("");
  const [country, setCountry] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewsResult | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const abortRef = useRef<AbortController | null>(null);

  async function load(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
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
        body: JSON.stringify({ input: q, country }),
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
          <SentimentPanel app={result.app} summary={result.summary} />

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

function SentimentPanel({ app, summary }: { app: ReviewedApp; summary: ReviewSummary }) {
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

      {/* Distribution bars */}
      <div className="flex flex-col justify-center gap-1.5">
        {([5, 4, 3, 2, 1] as const).map((n) => {
          const count = summary.distribution[n];
          const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
          return (
            <div key={n} className="flex items-center gap-2.5 text-xs">
              <span className="flex w-7 shrink-0 items-center gap-0.5 font-mono text-faint">
                {n}
                <Star size={10} className="fill-amber-400 text-amber-400" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime to-lime-dim transition-all duration-500"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted">{pct}%</span>
            </div>
          );
        })}
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

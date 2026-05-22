"use client";

import { useState } from "react";
import Image from "next/image";
import { Search, Loader2, ExternalLink, X, Star } from "lucide-react";
import type { KeywordAnalysis, RankedApp } from "@/lib/aso/analyze";
import { MetricBar } from "@/components/MetricBar";
import { compact, dlRange, COUNTRIES } from "@/lib/format";

const CLASS_STYLES: Record<string, string> = {
  "Sweet Spot": "bg-green-500/15 text-green-300 border-green-500/30",
  "Good Target": "bg-green-500/15 text-green-300 border-green-500/30",
  "Hidden Gem": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "High Competition": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Moderate: "bg-surface-3 text-slate-300 border-line",
  "Low Volume": "bg-surface-3 text-slate-300 border-line",
  Avoid: "bg-red-500/15 text-red-300 border-red-500/30",
};

export default function KeywordExplorer() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordAnalysis | null>(null);
  const [modalApps, setModalApps] = useState<RankedApp[] | null>(null);

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    const term = keyword.trim();
    if (!term || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keywords/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: term, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data as KeywordAnalysis);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Keyword Explorer</h1>
        <p className="mt-1 text-sm text-muted">
          Estimate App Store popularity, difficulty, and opportunity for any keyword.
        </p>
      </header>

      {/* Search bar */}
      <form onSubmit={analyze} className="mb-8 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 focus-within:border-lime/50">
          <Search size={18} className="text-faint" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Enter a keyword, e.g. kegel trainer"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
            autoFocus
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-lime/50"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-surface">
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-semibold text-ink transition hover:bg-lime-dim disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Check
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <div className="rounded-xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center text-muted">
          <Search size={28} className="mx-auto mb-3 text-faint" />
          <p className="text-sm">Search a keyword to see its ASO metrics and the apps ranking for it.</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary metrics */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Popularity" big={result.popularity ?? "—"}>
              <MetricBar value={result.popularity} tone="pop" />
            </MetricCard>
            <MetricCard label="Difficulty" big={result.difficulty}>
              <MetricBar value={result.difficulty} tone="diff" />
              <span className="text-xs text-muted">{result.difficultyLabel}</span>
            </MetricCard>
            <MetricCard label="Opportunity" big={result.opportunity}>
              <MetricBar value={result.opportunity} tone="pop" />
            </MetricCard>
            <MetricCard label="Est. searches / day" big={compact(Math.round(result.dailySearches))}>
              <span className="text-xs text-muted">{result.resultCount} apps competing</span>
            </MetricCard>
          </section>

          {/* Targeting verdict */}
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                CLASS_STYLES[result.targeting.label] ?? "border-line bg-surface-3"
              }`}
            >
              <span>{result.targeting.icon}</span>
              {result.targeting.label}
            </span>
            <p className="text-sm text-muted">{result.targeting.description}</p>
          </section>

          {/* Difficulty by ranking tier */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold">Difficulty by ranking tier</h2>
            <div className="grid grid-cols-3 gap-3">
              {(["top5", "top10", "top20"] as const).map((k) => {
                const t = result.difficultyTiers[k];
                const labelMap = { top5: "Top 5", top10: "Top 10", top20: "Top 20" };
                return (
                  <div key={k} className="rounded-lg bg-surface-2 p-3">
                    <p className="text-xs text-faint">{labelMap[k]}</p>
                    <p className="mt-1 font-mono text-xl tabular-nums">{t.score}</p>
                    <p className="text-xs text-muted">{t.label}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Apps ranking */}
          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold">
                Apps ranking for <span className="text-lime">&ldquo;{result.keyword}&rdquo;</span>
              </h2>
              {result.apps.length > 0 && (
                <button
                  onClick={() => setModalApps(result.apps)}
                  className="text-xs text-muted hover:text-white"
                >
                  View all
                </button>
              )}
            </div>
            {result.apps.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No ranking apps found.</p>
            ) : (
              <ul className="divide-y divide-line">
                {result.apps.map((app) => (
                  <AppRow key={app.trackId} app={app} />
                ))}
              </ul>
            )}
          </section>

          <p className="pb-4 text-center text-xs text-faint">
            All metrics are estimates derived from the public iTunes Search API.
          </p>
        </div>
      )}

      {modalApps && (
        <AppsModal keyword={result?.keyword ?? ""} apps={modalApps} onClose={() => setModalApps(null)} />
      )}
    </div>
  );
}

function MetricCard({ label, big, children }: { label: string; big: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="mb-2 mt-0.5 font-mono text-2xl font-semibold tabular-nums">{big}</p>
      {children}
    </div>
  );
}

function AppRow({ app }: { app: RankedApp }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/50">
      <span className="w-6 shrink-0 text-center font-mono text-sm text-faint">{app.rank}</span>
      {app.icon ? (
        <Image
          src={app.icon}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl"
          unoptimized
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-3" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{app.name}</p>
        <p className="truncate text-xs text-muted">{app.developer}</p>
      </div>
      <div className="hidden w-20 shrink-0 text-right sm:block">
        <p className="flex items-center justify-end gap-1 text-sm">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          {app.rating || "—"}
        </p>
        <p className="text-xs text-faint">{compact(app.ratingCount)} ratings</p>
      </div>
      <div className="w-24 shrink-0 text-right">
        <p className="font-mono text-sm tabular-nums text-lime">
          {dlRange(app.estDownloadsLow, app.estDownloadsHigh)}
        </p>
        <p className="text-xs text-faint">est. dl/day</p>
      </div>
      {app.url && (
        <a href={app.url} target="_blank" rel="noopener noreferrer" className="text-faint hover:text-white">
          <ExternalLink size={15} />
        </a>
      )}
    </li>
  );
}

function AppsModal({ keyword, apps, onClose }: { keyword: string; apps: RankedApp[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold">
            Apps ranking for <span className="text-lime">&ldquo;{keyword}&rdquo;</span>
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <ul className="max-h-[calc(80vh-57px)] divide-y divide-line overflow-y-auto">
          {apps.map((app) => (
            <AppRow key={app.trackId} app={app} />
          ))}
        </ul>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Loader2, ExternalLink, X, Star, Trash2, Bookmark, CheckCircle2 } from "lucide-react";
import type { KeywordAnalysis, RankedApp } from "@/lib/aso/analyze";
import { MetricBar } from "@/components/MetricBar";
import { compact, dlRange, COUNTRIES } from "@/lib/format";
import {
  saveKeyword,
  removeSavedKeyword,
  type SavedKeywordDTO,
} from "@/app/actions/keywords";

const CLASS_STYLES: Record<string, string> = {
  "Sweet Spot": "bg-green-500/15 text-green-300 border-green-500/30",
  "Good Target": "bg-green-500/15 text-green-300 border-green-500/30",
  "Hidden Gem": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "High Competition": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Moderate: "bg-surface-3 text-slate-300 border-line",
  "Low Volume": "bg-surface-3 text-slate-300 border-line",
  Avoid: "bg-red-500/15 text-red-300 border-red-500/30",
};

export default function KeywordExplorer({
  isAuthed,
  initialSaved,
}: {
  isAuthed: boolean;
  initialSaved: SavedKeywordDTO[];
}) {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordAnalysis | null>(null);
  const [modalApps, setModalApps] = useState<RankedApp[] | null>(null);
  const [saved, setSaved] = useState<SavedKeywordDTO[]>(initialSaved);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  async function analyze(term: string, ctry: string) {
    const q = term.trim();
    if (!q) return;

    // Cancel any in-flight request so the user never waits for a stale result.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keywords/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q, country: ctry }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const analysis = data as KeywordAnalysis;
      setResult(analysis);

      // Auto-save if authed and not already in the list
      if (isAuthed) {
        const alreadySaved = saved.find(
          (s) => s.term === analysis.keyword.toLowerCase() && s.country === analysis.country
        );
        if (!alreadySaved) {
          try {
            const rec = await saveKeyword({
              term: analysis.keyword,
              country: analysis.country,
              popularity: analysis.popularity,
              difficulty: analysis.difficulty,
              opportunity: analysis.opportunity,
              classification: analysis.targeting.label,
            });
            setSaved((prev) => [rec, ...prev.filter((s) => s.id !== rec.id)]);
          } catch {
            // silently ignore — search result is still shown
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // silently cancelled — do not update state
      setError((err as Error).message);
      setResult(null);
    } finally {
      // Only clear loading if this controller is still the active one
      if (abortRef.current === controller) setLoading(false);
    }
  }

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    await analyze(keyword, country);
  }

  async function openSaved(s: SavedKeywordDTO) {
    setKeyword(s.term);
    setCountry(s.country);
    await analyze(s.term, s.country);
  }

  async function removeOne(id: string) {
    const prev = saved;
    setSaved((s) => s.filter((k) => k.id !== id)); // optimistic
    try {
      await removeSavedKeyword(id);
    } catch (err) {
      setSaved(prev); // rollback
      showToast((err as Error).message, false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Keyword Explorer</h1>
        <p className="mt-1 text-sm text-muted">
          Estimate App Store popularity, difficulty, and opportunity for any keyword.
        </p>
      </header>

      {/* Search bar */}
      <form onSubmit={onSearch} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 transition-all duration-200 focus-within:border-lime/80 focus-within:ring-2 focus-within:ring-lime/10">
          <Search size={18} className="text-faint" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Enter a keyword, e.g. kegel trainer"
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
          disabled={loading || !keyword.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Check
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Tracked keywords panel */}
        <aside className="order-2 lg:order-1">
          <div className="rounded-2xl border border-line bg-surface/80 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-lime/25 hover:shadow-[0_4px_25px_rgba(198,244,50,0.02)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Bookmark size={15} className="text-lime" /> Tracked Keywords
              </h2>
              <span className="rounded-md border border-line/60 bg-surface-3/50 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-inner">
                {saved.length}
              </span>
            </div>

            {!isAuthed ? (
              <div className="px-4 py-6 text-center">
                <p className="mb-3 text-sm text-muted">Sign in to save and track keywords.</p>
                <Link
                  href="/login"
                  className="inline-block rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink hover:bg-lime-dim active:scale-95 transition-all cursor-pointer shadow-[0_0_15px_rgba(198,244,50,0.1)]"
                >
                  Sign in
                </Link>
              </div>
            ) : saved.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                No saved keywords yet. Search one, then tap the star.
              </p>
            ) : (
              <ul className="max-h-[600px] divide-y divide-line/40 overflow-y-auto">
                {saved.map((s) => (
                  <li key={s.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/40 transition-colors">
                    <button
                      onClick={() => openSaved(s)}
                      className="min-w-0 flex-1 text-left active:scale-[0.98] transition-transform duration-100 cursor-pointer"
                    >
                      <div className="flex flex-col gap-1.5">
                        <p className="truncate text-sm font-semibold text-white group-hover:text-lime transition-colors duration-200">
                          {s.term}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="rounded border border-line bg-surface-3/40 px-1.5 py-0.25 font-mono text-[9px] font-bold tracking-wider text-muted uppercase">
                            {s.country}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-lime/80 shadow-[0_0_8px_rgba(198,244,50,0.5)]" />
                            Pop <span className="font-mono font-semibold text-white">{s.popularity ?? "—"}</span>
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                            <span className={`h-1.5 w-1.5 rounded-full ${s.difficulty ? (s.difficulty <= 35 ? "bg-green-400" : s.difficulty <= 65 ? "bg-amber-400" : "bg-red-400") : "bg-faint"}`} />
                            Diff <span className={`font-mono font-semibold ${s.difficulty ? (s.difficulty <= 35 ? "text-green-400" : s.difficulty <= 65 ? "text-amber-400" : "text-red-400") : "text-faint"}`}>{s.difficulty ?? "—"}</span>
                          </span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeOne(s.id)}
                      className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-red-400 p-1.5 rounded hover:bg-surface-3 cursor-pointer shrink-0 active:scale-90"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Results */}
        <div className="order-1 min-w-0 lg:order-2">
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* First-time skeleton: loading with no prior result */}
          {loading && !result && <KeywordSkeleton />}

          {/* Re-search banner: loading over an existing result */}
          {loading && result && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-lime/20 bg-lime/5 px-3 py-2 text-xs text-lime animate-fade-in">
              <Loader2 size={13} className="animate-spin" />
              Re-analyzing &ldquo;{keyword}&rdquo;…
            </div>
          )}

          {!result && !error && !loading && (
            <div className="rounded-xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center text-muted">
              <Search size={28} className="mx-auto mb-3 text-faint" />
              <p className="text-sm font-medium text-white mb-1">Search any App Store keyword</p>
              <p className="text-sm">See popularity, difficulty, opportunity, and the top ranking apps.</p>
            </div>
          )}

          {result ? (
            <div className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-50 pointer-events-none" : "animate-fade-in"}`}>
              {/* Result heading */}
              <h2 className="text-lg font-medium text-white">
                <span className="text-lime">&ldquo;{result.keyword}&rdquo;</span>
              </h2>

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
                    Top apps for <span className="text-lime">&ldquo;{result.keyword}&rdquo;</span>
                  </h2>
                  {result.apps.length > 0 && (
                    <button onClick={() => setModalApps(result.apps)} className="text-xs text-muted hover:text-white">
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
                Apps sorted by rating count. All metrics are estimates from the public iTunes Search API.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {modalApps && (
        <AppsModal keyword={result?.keyword ?? ""} apps={modalApps} onClose={() => setModalApps(null)} />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={[
            "fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl animate-slide-up",
            toast.ok
              ? "border-lime/30 bg-surface text-lime"
              : "border-red-500/30 bg-surface text-red-300",
          ].join(" ")}
        >
          {toast.ok ? <CheckCircle2 size={15} /> : <X size={15} />}
          {toast.msg}
        </div>
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
        <Image src={app.icon} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" unoptimized />
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
        <p className="font-mono text-sm tabular-nums text-lime">{dlRange(app.estDownloadsLow, app.estDownloadsHigh)}</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold">
            Top apps for <span className="text-lime">&ldquo;{keyword}&rdquo;</span>
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

function KeywordSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Save bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 rounded-lg bg-surface-3" />
        <div className="h-8 w-20 rounded-lg bg-surface-3" />
      </div>

      {/* Summary metrics skeleton */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <div className="h-3 w-16 rounded bg-surface-3 mb-3" />
            <div className="h-8 w-24 rounded-lg bg-surface-3 mb-2 font-mono text-2xl" />
            <div className="h-1.5 w-full rounded-full bg-surface-3" />
          </div>
        ))}
      </section>

      {/* Targeting verdict skeleton */}
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
        <div className="h-7 w-32 rounded-full bg-surface-3" />
        <div className="h-4 flex-1 rounded bg-surface-3" />
      </section>

      {/* Difficulty by ranking tier skeleton */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="h-4 w-44 rounded bg-surface-3 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg bg-surface-2 p-3">
              <div className="h-3 w-10 rounded bg-surface-3 mb-2" />
              <div className="h-6 w-12 rounded bg-surface-3 mb-2" />
              <div className="h-3 w-16 rounded bg-surface-3" />
            </div>
          ))}
        </div>
      </section>

      {/* Apps ranking skeleton */}
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="h-4 w-32 rounded bg-surface-3" />
          <div className="h-3 w-12 rounded bg-surface-3" />
        </div>
        <ul className="divide-y divide-line">
          {[...Array(5)].map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="h-4 w-4 rounded bg-surface-3 shrink-0" />
              <div className="h-10 w-10 rounded-xl bg-surface-3 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-surface-3" />
                <div className="h-3 w-1/4 rounded bg-surface-3" />
              </div>
              <div className="hidden w-20 shrink-0 space-y-2 sm:block">
                <div className="h-3 w-12 rounded bg-surface-3 ml-auto" />
                <div className="h-3 w-16 rounded bg-surface-3 ml-auto" />
              </div>
              <div className="w-24 shrink-0 space-y-2">
                <div className="h-4 w-16 rounded bg-surface-3 ml-auto" />
                <div className="h-3 w-12 rounded bg-surface-3 ml-auto" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

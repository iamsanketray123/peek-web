"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Smartphone,
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  Star,
  Globe,
} from "lucide-react";
import GlobalMatrixModal from "@/components/GlobalMatrixModal";
import MetadataOptimizer from "@/components/MetadataOptimizer";
import {
  addAppKeyword,
  removeAppKeyword,
  refreshAppRanks,
  getTrackedApp,
  addCompetitorApp,
  removeCompetitorApp,
  type TrackedAppDTO,
  type AppKeywordDTO,
} from "@/app/actions/apps";
import { MetricBar } from "@/components/MetricBar";
import { compact } from "@/lib/format";
import RankChart from "@/components/RankChart";

type Tab = "keywords" | "history" | "optimizer";

export default function AppDetail({
  app,
  initialKeywords,
}: {
  app: TrackedAppDTO;
  initialKeywords: AppKeywordDTO[];
}) {
  const router = useRouter();
  const [currentApp, setCurrentApp] = useState<TrackedAppDTO>(app);
  const [keywords, setKeywords] = useState<AppKeywordDTO[]>(initialKeywords);
  const [tab, setTab] = useState<Tab>("keywords");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Competitor tracking state
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [addingComp, startAddComp] = useTransition();

  // Global storefront localization state
  const [activeGlobalTerm, setActiveGlobalTerm] = useState<string | null>(null);

  // Active polling: check status every 2 seconds if app is seeding in the background
  useEffect(() => {
    const isSeeding = currentApp.seedStatus === "pending" || currentApp.seedStatus === "seeding";
    if (!isSeeding) return;

    const interval = setInterval(async () => {
      try {
        const fresh = await getTrackedApp(currentApp.id);
        if (fresh) {
          setCurrentApp(fresh.app);
          if (fresh.app.seedStatus === "completed" || fresh.app.seedStatus === "error") {
            setKeywords(fresh.keywords);
            router.refresh();
          }
        }
      } catch (err) {
        console.error("Failed to poll app background status:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentApp.id, currentApp.seedStatus, router]);

  const sortedKeywords = [...keywords].sort((a, b) => {
    const posA = a.position;
    const posB = b.position;
    if (posA !== null && posB !== null) {
      return posA - posB;
    }
    if (posA !== null) return -1;
    if (posB !== null) return 1;
    
    // Both not ranked: sort by popularity descending
    const popA = a.popularity ?? 0;
    const popB = b.popularity ?? 0;
    return popB - popA;
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const t = term.trim();
    if (!t) return;
    startAdd(async () => {
      try {
        const kw = await addAppKeyword(currentApp.id, t);
        setKeywords((prev) => [...prev.filter((k) => k.id !== kw.id), kw]);
        setTerm("");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleRemove(id: string) {
    setRemovingId(id);
    // Optimistic: remove from UI immediately
    const prev = keywords;
    setKeywords((kws) => kws.filter((k) => k.id !== id));
    startAdd(async () => {
      try {
        await removeAppKeyword(id);
      } catch (err) {
        // Rollback on failure
        setKeywords(prev);
        setError((err as Error).message);
      } finally {
        setRemovingId(null);
      }
    });
  }

  function handleRefresh() {
    setError(null);
    startRefresh(async () => {
      try {
        await refreshAppRanks(currentApp.id);
        const fresh = await getTrackedApp(currentApp.id);
        if (fresh) setKeywords(fresh.keywords);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleAddCompetitor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = competitorQuery.trim();
    if (!q) return;
    startAddComp(async () => {
      try {
        const comp = await addCompetitorApp(currentApp.id, q);
        setCurrentApp((prev) => ({
          ...prev,
          competitors: [...(prev.competitors || []), comp],
        }));
        setIsAddingCompetitor(false);
        setCompetitorQuery("");
        
        // Refetch keywords to populate competitor positions immediately
        const fresh = await getTrackedApp(currentApp.id);
        if (fresh) {
          setKeywords(fresh.keywords);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleRemoveCompetitor(compId: string) {
    setError(null);
    const prevCompetitors = currentApp.competitors || [];
    setCurrentApp((prev) => ({
      ...prev,
      competitors: prev.competitors?.filter((c) => c.id !== compId) || [],
    }));

    startAddComp(async () => {
      try {
        await removeCompetitorApp(compId);
        // Clean up competitor positions from keywords locally
        setKeywords((kws) =>
          kws.map((k) => {
            const nextPositions = { ...k.competitorPositions };
            const comp = prevCompetitors.find((c) => c.id === compId);
            if (comp) {
              delete nextPositions[comp.appleId];
            }
            return {
              ...k,
              competitorPositions: nextPositions,
            };
          })
        );
      } catch (err) {
        setCurrentApp((prev) => ({
          ...prev,
          competitors: prevCompetitors,
        }));
        setError((err as Error).message);
      }
    });
  }

  const storeUrl = `https://apps.apple.com/${currentApp.country}/app/id${currentApp.appleId}`;
  const isBackgroundProcessing = currentApp.seedStatus === "pending" || currentApp.seedStatus === "seeding";

  return (
    <div>
      {/* App header */}
      <div className="mb-6 flex items-start gap-4">
        {currentApp.iconUrl ? (
          <Image
            src={currentApp.iconUrl}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 shrink-0 rounded-2xl border border-line/45 shadow-lg"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-3 border border-line/45 shadow-lg">
            <Smartphone size={26} className="text-faint" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-white">{currentApp.name}</h1>
          <p className="truncate text-sm text-muted">{currentApp.developer}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-faint">
            <span className="flex items-center gap-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span className="text-white font-semibold">{currentApp.avgRating ? currentApp.avgRating.toFixed(1) : "—"}</span> ({compact(currentApp.ratingCount)})
            </span>
            {currentApp.primaryGenre && <span>{currentApp.primaryGenre}</span>}
            <span className="uppercase font-mono bg-surface-3/50 px-1 py-0.25 rounded border border-line/50 text-[10px] text-white font-bold">{currentApp.country}</span>
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-lime hover:underline hover:text-lime-dim transition-colors"
            >
              App Store <ExternalLink size={11} />
            </a>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isBackgroundProcessing}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium transition-all duration-200 hover:border-lime/30 active:scale-[0.98] disabled:active:scale-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(198,244,50,0.05)] text-white"
          title={isBackgroundProcessing ? "ASO keywords are seeding..." : "Re-check ranks and keywords"}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin text-lime" : "text-faint transition-colors"} />
          Refresh
        </button>
      </div>

      {isBackgroundProcessing ? (
        /* Gorgeous premium background keyword seeding loader matching AppKittie */
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/35 p-8 text-center backdrop-blur-md shadow-2xl border-lime/10 animate-fade-in">
          {/* Background glowing gradients */}
          <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-lime/10 blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />

          {/* Animated pulsing spinner */}
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 border border-line shadow-inner">
            <div className="absolute inset-0 rounded-2xl border border-dashed border-lime/40 animate-spin duration-[4000ms]" />
            <Loader2 size={32} className="animate-spin text-lime" />
          </div>

          <h3 className="text-lg font-bold text-white tracking-tight">Analyzing App Store Data</h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-muted leading-relaxed">
            Peek Web is scanning metadata for <span className="font-semibold text-white">{currentApp.name}</span> in the <span className="uppercase text-white font-mono">{currentApp.country}</span> store. We are compiling high-value semantic keywords, evaluating search volume, and resolving rank positions.
          </p>

          {/* Active Step Indicator Checklist */}
          <div className="mx-auto mt-8 max-w-sm text-left space-y-3.5 border-t border-line/60 pt-6">
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime/25 text-[10px] font-bold text-lime">
                ✓
              </span>
              <div>
                <p className="text-xs font-semibold text-white">Parsed app identity</p>
                <p className="text-[10px] text-faint">Identified category: {currentApp.primaryGenre || "Unknown Genre"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime/25 text-[10px] font-bold text-lime">
                ✓
              </span>
              <div>
                <p className="text-xs font-semibold text-white">Extracted brand tokens</p>
                <p className="text-[10px] text-faint">Filtered company tags and developer name: {currentApp.developer}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {currentApp.seedStatus === "pending" ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[10px] font-bold text-faint">
                  3
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime/15 border border-lime/30 text-[10px] font-bold text-lime animate-pulse">
                  <Loader2 size={10} className="animate-spin" />
                </span>
              )}
              <div>
                <p className={`text-xs font-semibold ${currentApp.seedStatus === "seeding" ? "text-lime animate-pulse" : "text-white"}`}>
                  {currentApp.seedStatus === "seeding" ? "Synthesizing modifier combinations..." : "Queued: modifier combinations"}
                </p>
                <p className="text-[10px] text-faint">Generating compound keyword seeds & industry ASO phrases</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[10px] font-bold text-faint">
                4
              </span>
              <div>
                <p className="text-xs font-semibold text-muted">Calculating search metrics & ranks</p>
                <p className="text-[10px] text-faint">Querying Apple API in parallel and resolving ASO volumes</p>
              </div>
            </div>
          </div>

          {/* Interactive Loading Bar */}
          <div className="mx-auto mt-8 max-w-xs overflow-hidden rounded-full bg-surface-2 border border-line p-0.5 shadow-inner">
            <div className={`h-1.5 rounded-full bg-gradient-to-r from-lime to-lime-dim shadow-[0_0_12px_rgba(198,244,50,0.4)] transition-all duration-[8000ms] ease-out ${
              currentApp.seedStatus === "seeding" ? "w-[85%]" : "w-[20%]"
            }`} />
          </div>
          <p className="mt-3.5 text-[9px] text-faint uppercase font-bold tracking-widest animate-pulse">
            Processing in background — feel free to explore other apps meanwhile
          </p>
        </div>
      ) : (
        <>
          {/* Competitor section */}
          <div className="mb-6 rounded-2xl border border-line bg-surface/20 p-4 backdrop-blur-sm shadow-[0_4px_30px_rgba(0,0,0,0.2)] animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-faint">Competitors ({currentApp.competitors?.length ?? 0}/5)</span>
                <div className="flex flex-wrap items-center gap-2">
                  {currentApp.competitors?.map((comp) => (
                    <div
                      key={comp.id}
                      className="group relative flex items-center gap-2 rounded-xl border border-line bg-surface/50 px-2.5 py-1.5 transition-all hover:border-red-500/30"
                    >
                      {comp.iconUrl ? (
                        <Image
                          src={comp.iconUrl}
                          alt=""
                          width={20}
                          height={20}
                          unoptimized
                          className="h-5 w-5 rounded-md border border-line/45 shadow-sm"
                        />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-3 border border-line/40">
                          <Smartphone size={10} className="text-faint" />
                        </div>
                      )}
                      <div className="max-w-[120px]">
                        <p className="truncate text-xs font-semibold text-white/90" title={comp.name}>{comp.name}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveCompetitor(comp.id)}
                        className="absolute -top-1.5 -right-1.5 hidden h-4.5 w-4.5 items-center justify-center rounded-full bg-surface-3 border border-line text-[9px] text-faint hover:text-red-400 hover:border-red-500/40 group-hover:flex cursor-pointer transition-colors"
                        title="Remove competitor"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(!currentApp.competitors || currentApp.competitors.length === 0) && (
                    <span className="text-xs text-muted">No competitors added. Compare your keyword rankings head-to-head.</span>
                  )}
                </div>
              </div>

              {/* Add Competitor Trigger / Input */}
              {(currentApp.competitors?.length ?? 0) < 5 && (
                <div className="relative">
                  {isAddingCompetitor ? (
                    <form onSubmit={handleAddCompetitor} className="flex items-center gap-1.5 animate-slide-left">
                      <input
                        value={competitorQuery}
                        onChange={(e) => setCompetitorQuery(e.target.value)}
                        placeholder="Search App Name or paste Link..."
                        autoFocus
                        className="w-56 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-white outline-none focus:border-lime/80"
                      />
                      <button
                        type="submit"
                        disabled={addingComp}
                        className="rounded-xl bg-lime px-3 py-1.5 text-xs font-bold text-ink hover:bg-lime-dim disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                      >
                        {addingComp ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCompetitor(false);
                          setCompetitorQuery("");
                          setError(null);
                        }}
                        className="rounded-xl border border-line bg-surface/50 px-2 py-1.5 text-xs text-faint hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsAddingCompetitor(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-line bg-surface/50 px-3 py-1.5 text-xs font-semibold text-white hover:border-lime/30 active:scale-[0.98] transition-all cursor-pointer hover:shadow-[0_0_12px_rgba(198,244,50,0.03)]"
                    >
                      <Plus size={12} className="text-lime" />
                      Add Competitor
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-5 flex gap-1 border-b border-line">
            {(["keywords", "history", "optimizer"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "px-4 py-2.5 text-sm font-medium capitalize transition-all duration-200 border-b-2 relative -mb-[1px] cursor-pointer",
                  tab === t
                    ? "border-lime text-lime font-semibold"
                    : "border-transparent text-muted hover:text-white hover:border-line/50",
                ].join(" ")}
              >
                {t === "history" ? "Position History" : t === "optimizer" ? "AI Optimizer" : "Keywords"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 animate-slide-up">
              {error}
            </div>
          )}

          {tab === "keywords" ? (
            <>
              {/* Add keyword */}
              <form onSubmit={handleAdd} className="mb-5 flex gap-2">
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Add a keyword to track (e.g. habit tracker)…"
                  className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-white outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10"
                />
                <button
                  type="submit"
                  disabled={adding}
                  className="flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] disabled:active:scale-100 disabled:opacity-40 cursor-pointer hover:shadow-[0_0_20px_rgba(198,244,50,0.15)]"
                >
                  {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add
                </button>
              </form>

              {keywords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-14 text-center">
                  <p className="text-sm font-medium text-white">No keywords tracked yet</p>
                  <p className="mt-1 text-sm text-muted">
                    Add a keyword above to record this app&apos;s current rank.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-line bg-surface/20 shadow-xl border-line/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface/85 text-left text-xs uppercase tracking-wide text-faint">
                        <th className="px-5 py-3.5 font-semibold">Keyword</th>
                        <th className="w-28 px-5 py-3.5 font-semibold">Position</th>
                        {currentApp.competitors?.map((comp) => (
                          <th key={comp.id} className="w-32 px-5 py-3.5 font-semibold">
                            <div className="flex items-center gap-1.5" title={comp.name}>
                              {comp.iconUrl && (
                                <Image
                                  src={comp.iconUrl}
                                  alt=""
                                  width={16}
                                  height={16}
                                  unoptimized
                                  className="h-4 w-4 rounded-md border border-line/30"
                                />
                              )}
                              <span className="truncate max-w-[80px]">{comp.name}</span>
                            </div>
                          </th>
                        ))}
                        <th className="w-40 px-5 py-3.5 font-semibold">Popularity</th>
                        <th className="w-44 px-5 py-3.5 font-semibold">Difficulty</th>
                        <th className="w-24 px-5 py-3.5 font-semibold">Trend</th>
                        <th className="w-12 px-5 py-3.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {sortedKeywords.map((k) => (
                        <tr key={k.id} className="group border-b border-line/60 last:border-0 hover:bg-surface/40 transition-colors duration-150">
                          <td className="px-5 py-4 font-medium text-white">
                            <div className="flex items-center gap-2">
                              <span>{k.term}</span>
                              <button
                                onClick={() => setActiveGlobalTerm(k.term)}
                                className="opacity-0 group-hover:opacity-100 hover:text-lime text-faint transition-all duration-200 cursor-pointer p-0.5"
                                title="View localized global ranks"
                              >
                                <Globe size={13} />
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <PositionCell position={k.position} delta={k.delta} />
                          </td>
                          {currentApp.competitors?.map((comp) => {
                            const compPos = k.competitorPositions?.[comp.appleId] ?? null;
                            return (
                              <td key={comp.id} className="px-5 py-4">
                                <CompetitorPositionCell
                                  position={compPos}
                                  mainPosition={k.position}
                                />
                              </td>
                            );
                          })}
                          <td className="px-5 py-4">
                            <MetricBar value={k.popularity} tone="pop" />
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <MetricBar value={k.difficulty} tone="diff" />
                              </div>
                              {k.difficultyLabel && (
                                <span className="shrink-0 text-[11px] font-medium text-faint">{k.difficultyLabel}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <RankChart history={k.history} width={72} height={26} />
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleRemove(k.id)}
                              disabled={removingId === k.id}
                              className="rounded-lg p-2 text-faint opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 hover:bg-surface-3 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                              title="Remove keyword"
                            >
                              {removingId === k.id ? (
                                <Loader2 size={15} className="animate-spin text-red-400" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-faint">
                Position is the app&apos;s rank in App Store search results for the keyword (estimated
                from Apple&apos;s relevance ordering). Ranks update daily; use Refresh to check now.
              </p>
            </>
          ) : tab === "history" ? (
            <HistoryTab keywords={sortedKeywords} />
          ) : (
            <MetadataOptimizer appId={currentApp.id} />
          )}
        </>
      )}
      {activeGlobalTerm && (
        <GlobalMatrixModal
          appId={currentApp.id}
          term={activeGlobalTerm}
          onClose={() => setActiveGlobalTerm(null)}
        />
      )}
    </div>
  );
}

function PositionCell({ position, delta }: { position: number | null; delta: number | null }) {
  if (position == null) {
    return <span className="text-sm text-faint">Not ranked</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm font-semibold tabular-nums text-white">#{position}</span>
      {delta != null && delta !== 0 ? (
        <span
          className={[
            "flex items-center gap-0.5 text-xs font-medium",
            delta > 0 ? "text-green-400" : "text-red-400",
          ].join(" ")}
        >
          {delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {Math.abs(delta)}
        </span>
      ) : delta === 0 ? (
        <Minus size={12} className="text-faint" />
      ) : null}
    </span>
  );
}

function CompetitorPositionCell({
  position,
  mainPosition,
}: {
  position: number | null;
  mainPosition: number | null;
}) {
  if (position == null) {
    return <span className="text-sm text-faint">Not ranked</span>;
  }

  let comparisonElement = null;
  if (mainPosition != null) {
    if (position < mainPosition) {
      comparisonElement = (
        <span className="text-[9px] font-bold text-amber-500/80 uppercase px-1 py-0.25 rounded bg-amber-500/10 border border-amber-500/20 ml-2 whitespace-nowrap">
          Beating Us
        </span>
      );
    } else if (position > mainPosition) {
      comparisonElement = (
        <span className="text-[9px] font-bold text-emerald-400/80 uppercase px-1 py-0.25 rounded bg-emerald-500/10 border border-emerald-500/20 ml-2 whitespace-nowrap">
          Winning
        </span>
      );
    }
  }

  return (
    <div className="flex items-center">
      <span className="font-mono text-sm font-semibold tabular-nums text-white/95">#{position}</span>
      {comparisonElement}
    </div>
  );
}

function HistoryTab({ keywords }: { keywords: AppKeywordDTO[] }) {
  const withHistory = keywords.filter((k) => k.history.length > 0);
  if (withHistory.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-14 text-center">
        <p className="text-sm font-medium text-white">No position history yet</p>
        <p className="mt-1 text-sm text-muted">
          History builds up as ranks are checked daily. Add keywords and hit Refresh to seed it.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withHistory.map((k) => (
        <div key={k.id} className="rounded-2xl border border-line bg-surface p-4 transition-all duration-200 hover:border-lime/30 hover:shadow-[0_4px_20px_rgba(198,244,50,0.02)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">{k.term}</p>
            <PositionCell position={k.position} delta={k.delta} />
          </div>
          <RankChart history={k.history} width={520} height={120} showAxis />
          <p className="mt-2 text-xs text-faint">
            {k.history.length} check{k.history.length === 1 ? "" : "s"} recorded
          </p>
        </div>
      ))}
    </div>
  );
}

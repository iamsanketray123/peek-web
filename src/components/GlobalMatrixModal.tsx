"use client";

import { useState, useEffect } from "react";
import { Loader2, X, Globe, TrendingUp } from "lucide-react";
import { getGlobalRankMatrix, type GlobalRankPoint } from "@/app/actions/apps";
import { MetricBar } from "@/components/MetricBar";

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  us: { name: "United States", flag: "🇺🇸" },
  gb: { name: "United Kingdom", flag: "🇬🇧" },
  de: { name: "Germany", flag: "🇩🇪" },
  fr: { name: "France", flag: "🇫🇷" },
  jp: { name: "Japan", flag: "🇯🇵" },
  ca: { name: "Canada", flag: "🇨🇦" },
  au: { name: "Australia", flag: "🇦🇺" },
};

export default function GlobalMatrixModal({
  appId,
  term,
  onClose,
}: {
  appId: string;
  term: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GlobalRankPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const countries = Object.keys(COUNTRY_MAP);
        const matrix = await getGlobalRankMatrix(appId, term, countries);
        setData(matrix);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appId, term]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur-xl animate-scale-up">
        {/* Glowing background highlights */}
        <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-lime/5 blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/10 border border-lime/20 text-lime shadow-inner">
              <Globe size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Global Storefront Localization</h2>
              <p className="text-xs text-muted">
                Organic rank tracking for <span className="font-semibold text-lime">“{term}”</span> across major storefronts.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="close-global-matrix-modal-btn"
            className="rounded-lg p-1.5 text-faint hover:bg-surface-3 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={36} className="animate-spin text-lime" />
            <p className="mt-4 text-xs text-faint uppercase font-bold tracking-widest animate-pulse">
              Querying international App Stores...
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface/40 shadow-inner">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface/75 text-left text-xs uppercase tracking-wide text-faint font-semibold">
                  <th className="px-4 py-3 font-semibold">Storefront</th>
                  <th className="w-28 px-4 py-3 font-semibold">Organic Rank</th>
                  <th className="w-36 px-4 py-3 font-semibold">Search Volume</th>
                  <th className="w-36 px-4 py-3 font-semibold">Difficulty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/35">
                {data.map((item) => {
                  const countryInfo = COUNTRY_MAP[item.country] || { name: item.country, flag: "🌐" };
                  
                  // Strategic opportunity flag: high-intent indicator
                  // If ranked well (1-20) and has decent popularity (>= 20)
                  const isOpportunity = item.position != null && item.position <= 20 && (item.popularity ?? 0) >= 20;

                  return (
                    <tr key={item.country} className="hover:bg-surface/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg leading-none" role="img" aria-label={countryInfo.name}>
                            {countryInfo.flag}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-white">{countryInfo.name}</p>
                            <p className="text-[10px] text-faint font-mono uppercase">{item.country}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.position != null ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-white">#{item.position}</span>
                            {isOpportunity && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-lime uppercase px-1 py-0.25 rounded bg-lime/10 border border-lime/20" title="High visibility market">
                                <TrendingUp size={8} /> Active
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-faint">Not ranked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <MetricBar value={item.popularity} tone="pop" />
                      </td>
                      <td className="px-4 py-3">
                        <MetricBar value={item.difficulty} tone="diff" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 border-t border-line/60 pt-4 text-center">
          <p className="text-[10px] text-faint leading-relaxed">
            International ratings and algorithmic indexes vary dynamically based on localized title matches, downloads, and storefront conversion metrics.
          </p>
        </div>
      </div>
    </div>
  );
}

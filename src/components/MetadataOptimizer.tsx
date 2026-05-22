"use client";

import { useState } from "react";
import { Loader2, Sparkles, Copy, Check, Info } from "lucide-react";
import { generateOptimizedMetadata, type OptimizedMetadata } from "@/app/actions/apps";

export default function MetadataOptimizer({ appId }: { appId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OptimizedMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function handleOptimize() {
    try {
      setLoading(true);
      setError(null);
      const res = await generateOptimizedMetadata(appId);
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/20 p-6 backdrop-blur-sm shadow-xl">
      {/* Glowing ASO background accents */}
      <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-lime/5 blur-[100px] pointer-events-none" />

      <div className="flex flex-col gap-6">
        {/* Intro Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles size={16} className="text-lime" /> AI Storefront Metadata Optimizer
            </h2>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Compile your tracked keywords and dynamically compose optimized Title, Subtitle, and Keyword sets tailored for the strict Apple App Store indexing algorithms.
            </p>
          </div>
          {!data && !loading && (
            <button
              onClick={handleOptimize}
              id="optimize-metadata-btn"
              className="shrink-0 flex items-center gap-2 rounded-xl bg-lime px-4 py-2 text-xs font-bold text-ink hover:bg-lime-dim active:scale-[0.98] transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(198,244,50,0.12)]"
            >
              <Sparkles size={13} />
              Optimize Copy
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-lime" />
            <p className="mt-4 text-xs text-faint uppercase font-bold tracking-widest animate-pulse">
              Synthesizing semantic keyword variations...
            </p>
          </div>
        )}

        {data && !loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Input / Form fields displaying outputs */}
            <div className="lg:col-span-2 space-y-5">
              {/* Title Input Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label className="text-white">App Store Title</label>
                  <span className={`font-mono text-[10px] ${data.title.length > 30 ? "text-red-400 font-bold" : "text-faint"}`}>
                    {data.title.length}/30 characters
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    value={data.title}
                    readOnly
                    className="w-full rounded-xl border border-line bg-surface/75 px-4 py-3 text-sm text-white font-medium outline-none pr-12 border-lime/15 focus:border-lime/30"
                  />
                  <button
                    onClick={() => handleCopy(data.title, "title")}
                    className="absolute right-2.5 p-2 rounded-lg text-faint hover:text-white hover:bg-surface transition-colors cursor-pointer"
                    title="Copy Title"
                  >
                    {copiedField === "title" ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Subtitle Input Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label className="text-white">App Store Subtitle</label>
                  <span className={`font-mono text-[10px] ${data.subtitle.length > 30 ? "text-red-400 font-bold" : "text-faint"}`}>
                    {data.subtitle.length}/30 characters
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    value={data.subtitle}
                    readOnly
                    className="w-full rounded-xl border border-line bg-surface/75 px-4 py-3 text-sm text-white font-medium outline-none pr-12 border-lime/15 focus:border-lime/30"
                  />
                  <button
                    onClick={() => handleCopy(data.subtitle, "subtitle")}
                    className="absolute right-2.5 p-2 rounded-lg text-faint hover:text-white hover:bg-surface transition-colors cursor-pointer"
                    title="Copy Subtitle"
                  >
                    {copiedField === "subtitle" ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Keyword String Input Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label className="text-white">ASO Keywords Field</label>
                  <span className={`font-mono text-[10px] ${data.keywords.length > 100 ? "text-red-400 font-bold" : "text-faint"}`}>
                    {data.keywords.length}/100 characters
                  </span>
                </div>
                <div className="relative flex items-start">
                  <textarea
                    value={data.keywords}
                    readOnly
                    rows={3}
                    className="w-full rounded-xl border border-line bg-surface/75 px-4 py-3 text-sm text-white font-mono leading-relaxed outline-none pr-12 border-lime/15 focus:border-lime/30 resize-none"
                  />
                  <button
                    onClick={() => handleCopy(data.keywords, "keywords")}
                    className="absolute right-2.5 top-2.5 p-2 rounded-lg text-faint hover:text-white hover:bg-surface transition-colors cursor-pointer"
                    title="Copy Keywords Field"
                  >
                    {copiedField === "keywords" ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleOptimize}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-bold text-white hover:border-lime/30 transition-all cursor-pointer hover:shadow-[0_0_12px_rgba(198,244,50,0.03)]"
                >
                  <Sparkles size={12} className="text-lime animate-pulse" />
                  Regenerate Optimization
                </button>
              </div>
            </div>

            {/* Explanation / Insights Column */}
            <div className="rounded-xl border border-line/75 bg-surface/40 p-4 space-y-4 shadow-inner">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Info size={13} className="text-lime" /> Optimization Insights
              </h3>
              <div className="space-y-3.5">
                {data.explanation.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-xs leading-relaxed text-muted">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="rounded-xl border border-dashed border-line/60 bg-surface/20 px-4 py-10 text-center">
            <Sparkles size={24} className="mx-auto text-faint mb-3 animate-pulse" />
            <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
              Click the <span className="font-semibold text-white">&quot;Optimize Copy&quot;</span> button to generate highly performant, character-optimized title strings using real keyword metrics.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

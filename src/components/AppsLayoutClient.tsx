"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Smartphone,
  Plus,
  Loader2,
  Trash2,
  Star,
  ChevronRight,
  Search,
  X,
  Bookmark,
} from "lucide-react";
import { addTrackedApp, removeTrackedApp, type TrackedAppDTO } from "@/app/actions/apps";
import { COUNTRIES } from "@/lib/format";

export default function AppsLayoutClient({
  initialApps,
  children,
}: {
  initialApps: TrackedAppDTO[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("us");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  // Auto-clear navigatingTo when navigation completes (pathname matched)
  const effectiveNavigatingTo =
    navigatingTo && pathname !== `/apps/${navigatingTo}` ? navigatingTo : null;

  // Client-side redirect on desktop if we are on index "/apps" and have apps
  useEffect(() => {
    if (pathname === "/apps" && initialApps.length > 0) {
      // Small screen size check to ensure we only redirect on large viewports
      if (window.innerWidth >= 1024) {
        router.replace(`/apps/${initialApps[0].id}`);
      }
    }
  }, [pathname, initialApps, router]);

  const filteredApps = initialApps.filter((app) =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.developer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = query.trim();
    if (!q) return;

    startTransition(async () => {
      try {
        const newApp = await addTrackedApp({ query: q, country });
        setQuery("");
        setIsAddModalOpen(false);
        router.push(`/apps/${newApp.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleRemove(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setRemovingId(id);
    startTransition(async () => {
      try {
        await removeTrackedApp(id);
        // If we deleted the active app, redirect back to index
        if (pathname === `/apps/${id}`) {
          router.push("/apps");
        }
      } catch (err) {
        console.error("Failed to remove app", err);
      } finally {
        setRemovingId(null);
      }
    });
  }

  function handleAppClick(appId: string) {
    if (pathname !== `/apps/${appId}`) {
      setNavigatingTo(appId);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] w-full">
      {/* ── LEFT PANE (Sidebar on desktop) ────────────────────────────────── */}
      <aside className="hidden lg:flex w-[320px] xl:w-[360px] shrink-0 flex-col border-r border-line bg-surface/20">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Bookmark size={16} className="text-lime" />
            <h2 className="text-sm font-bold tracking-tight text-white">Your Apps</h2>
            <span className="rounded-md border border-line/60 bg-surface-3/50 px-1.5 py-0.25 font-mono text-[10px] font-bold text-white shadow-inner">
              {initialApps.length}
            </span>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-lime px-2.5 py-1.5 text-xs font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.95] cursor-pointer shadow-[0_0_15px_rgba(198,244,50,0.1)]"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* Live Search */}
        <div className="border-b border-line px-4 py-3">
          <div className="relative flex items-center rounded-xl border border-line bg-surface/50 px-3 py-1.5 text-sm transition-all focus-within:border-lime/60 focus-within:ring-2 focus-within:ring-lime/10">
            <Search size={14} className="text-faint shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter tracked apps…"
              className="ml-2 w-full bg-transparent text-xs text-white outline-none placeholder:text-faint/80"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="text-faint hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Sidebar List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {filteredApps.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted">
              {searchTerm ? "No matching apps found." : "No apps tracked yet."}
            </div>
          ) : (
            filteredApps.map((app) => {
              const isActive = pathname === `/apps/${app.id}`;
              const isNavigating = effectiveNavigatingTo === app.id;
              return (
                <Link
                  key={app.id}
                  href={`/apps/${app.id}`}
                  onClick={() => handleAppClick(app.id)}
                  className={`group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 ${
                    isActive || isNavigating
                      ? "border-lime/30 bg-lime/5 before:absolute before:left-0 before:top-[12%] before:bottom-[12%] before:w-[3px] before:rounded-r before:bg-lime"
                      : "border-transparent bg-transparent hover:bg-surface-2/30 hover:border-line/40"
                  }`}
                >
                  {app.iconUrl ? (
                    <Image
                      src={app.iconUrl}
                      alt=""
                      width={38}
                      height={38}
                      unoptimized
                      className="h-[38px] w-[38px] shrink-0 rounded-lg border border-line/40"
                    />
                  ) : (
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-surface-3 border border-line/40">
                      <Smartphone size={16} className="text-faint" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs font-semibold transition-colors duration-150 ${
                        isActive || isNavigating ? "text-lime" : "text-white group-hover:text-lime"
                      }`}
                    >
                      {app.name}
                    </p>
                    <p className="truncate text-[10px] text-muted">{app.developer}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-faint">
                      <span className="rounded border border-line bg-surface-3/30 px-1 py-0.1 font-mono font-bold uppercase">
                        {app.country}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-white">
                          {app.avgRating ? app.avgRating.toFixed(1) : "—"}
                        </span>
                      </span>
                      <span>•</span>
                      <span>
                        {app.keywordCount} kw{app.keywordCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {/* Desktop delete */}
                  <button
                    onClick={(e) => handleRemove(e, app.id)}
                    disabled={removingId === app.id}
                    className="rounded-md p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-surface-3 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                    title="Remove app"
                  >
                    {removingId === app.id ? (
                      <Loader2 size={13} className="animate-spin text-red-400" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-faint group-hover:text-lime transition-colors"
                  />
                </Link>
              );
            })
          )}
        </div>
      </aside>

      {/* ── RIGHT PANE (Details or main workspace) ────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>

      {/* ── ADD APP OVERLAY MODAL ─────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          {/* Modal Card */}
          <div className="relative max-w-md w-full rounded-2xl border border-line bg-surface p-6 shadow-2xl transition-all duration-300 border-lime/10">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsAddModalOpen(false);
                setError(null);
              }}
              className="absolute top-4 right-4 text-faint hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <header className="mb-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
                <Plus size={18} className="text-lime" /> Add App to Track
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Resolve a App Store application automatically via iTunes and compute ASO keywords.
              </p>
            </header>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">
                  App Name, URL, or Apple ID
                </label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Habit Tracker, or iTunes app link…"
                  className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-white outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">
                  Store Country / Region
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-white outline-none cursor-pointer transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-surface">
                      {c.flag} {c.name} ({c.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setError(null);
                  }}
                  className="rounded-xl border border-line bg-transparent px-4 py-2 text-xs font-semibold text-white transition hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-2 rounded-xl bg-lime px-5 py-2 text-xs font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 cursor-pointer shadow-[0_0_15px_rgba(198,244,50,0.15)]"
                >
                  {pending ? (
                    <Loader2 size={13} className="animate-spin text-ink" />
                  ) : (
                    <Plus size={13} />
                  )}
                  Add Tracked App
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

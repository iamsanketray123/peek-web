"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Smartphone, Plus, Loader2, Trash2, Star, ChevronRight } from "lucide-react";
import { addTrackedApp, removeTrackedApp, type TrackedAppDTO } from "@/app/actions/apps";
import { compact, COUNTRIES } from "@/lib/format";

export default function AppsManager({ initialApps }: { initialApps: TrackedAppDTO[] }) {
  const [apps, setApps] = useState<TrackedAppDTO[]>(initialApps);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("us");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      try {
        const app = await addTrackedApp({ query: q, country });
        setApps((prev) => {
          const without = prev.filter((a) => a.id !== app.id);
          return [app, ...without];
        });
        setQuery("");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleRemove(id: string) {
    setRemovingId(id);
    startTransition(async () => {
      try {
        await removeTrackedApp(id);
        setApps((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Smartphone size={22} className="text-lime" /> App Tracking
        </h1>
        <p className="mt-1 text-sm text-muted">
          Track your apps and monitor their keyword rankings over time.
        </p>
      </header>

      {/* Add app */}
      <form onSubmit={handleAdd} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="App name, App Store URL, or numeric ID…"
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 text-white"
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 cursor-pointer text-white"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-surface">
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add app
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* App list */}
      {apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center text-muted">
          <Smartphone size={28} className="mx-auto text-faint" />
          <p className="mt-3 text-sm font-medium text-white">No apps tracked yet</p>
          <p className="mt-1 text-sm text-muted">
            Add your first app above to start tracking keyword rankings.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-all duration-200 hover:border-lime/35 hover:shadow-[0_4px_20px_rgba(198,244,50,0.03)] hover:bg-surface-2/30"
            >
              <Link href={`/apps/${app.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:scale-[0.99] transition-transform duration-100">
                {app.iconUrl ? (
                  <Image
                    src={app.iconUrl}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                    className="h-12 w-12 shrink-0 rounded-xl border border-line/50"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-3 border border-line/50">
                    <Smartphone size={20} className="text-faint" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white group-hover:text-lime transition-colors">{app.name}</p>
                  <p className="truncate text-xs text-muted">{app.developer}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-faint">
                    <span className="flex items-center gap-1">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      <span className="text-white font-medium">{app.avgRating ? app.avgRating.toFixed(1) : "—"}</span>
                      <span className="text-faint/70">({compact(app.ratingCount)})</span>
                    </span>
                    <span className="text-muted">
                      {app.keywordCount} keyword{app.keywordCount === 1 ? "" : "s"}
                    </span>
                    <span className="uppercase text-faint font-semibold">{app.country}</span>
                  </div>
                </div>
              </Link>
              <button
                onClick={() => handleRemove(app.id)}
                disabled={removingId === app.id}
                className="rounded-lg p-2 text-faint opacity-0 transition hover:bg-surface-3 hover:text-red-300 group-hover:opacity-100 disabled:opacity-40 cursor-pointer"
                title="Remove app"
              >
                {removingId === app.id ? (
                  <Loader2 size={16} className="animate-spin text-red-400" />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
              <ChevronRight size={18} className="shrink-0 text-faint group-hover:text-lime transition-colors" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

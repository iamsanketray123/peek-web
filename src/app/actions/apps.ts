"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { lookupApp, searchApps, extractAppleId } from "@/lib/aso/itunes";
import { computeKeywordMetrics, findAppRank } from "@/lib/aso/rank";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface TrackedAppDTO {
  id: string;
  appleId: string;
  name: string;
  developer: string;
  iconUrl: string | null;
  primaryGenre: string | null;
  country: string;
  ratingCount: number;
  avgRating: number;
  price: string | null;
  releaseDate: string | null;
  keywordCount: number;
  createdAt: string;
}

export interface RankPointDTO {
  position: number | null;
  checkedAt: string;
}

export interface AppKeywordDTO {
  id: string;
  term: string;
  popularity: number | null;
  difficulty: number | null;
  difficultyLabel: string | null;
  position: number | null; // latest
  delta: number | null; // previous - latest (positive = moved up)
  metricsUpdatedAt: string | null;
  history: RankPointDTO[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}

function appToDTO(a: {
  id: string;
  appleId: string;
  name: string;
  developer: string;
  iconUrl: string | null;
  primaryGenre: string | null;
  country: string;
  ratingCount: number;
  avgRating: number;
  price: string | null;
  releaseDate: string | null;
  createdAt: Date;
  _count?: { keywords: number };
}): TrackedAppDTO {
  return {
    id: a.id,
    appleId: a.appleId,
    name: a.name,
    developer: a.developer,
    iconUrl: a.iconUrl,
    primaryGenre: a.primaryGenre,
    country: a.country,
    ratingCount: a.ratingCount,
    avgRating: a.avgRating,
    price: a.price,
    releaseDate: a.releaseDate,
    keywordCount: a._count?.keywords ?? 0,
    createdAt: a.createdAt.toISOString(),
  };
}

// ── App CRUD ──────────────────────────────────────────────────────────────

/**
 * Add an app to track. Accepts an App Store URL, numeric ID, or a search query
 * (app name) — resolves to a single app via the iTunes API.
 */
export async function addTrackedApp(input: {
  query: string;
  country?: string;
}): Promise<TrackedAppDTO> {
  const user = await requireUser();
  const country = (input.country || "us").toLowerCase();
  const query = input.query.trim();
  if (!query) throw new Error("Enter an App Store URL, ID, or app name.");

  // Resolve to a single app: prefer an explicit ID/URL, else search by name.
  const id = extractAppleId(query);
  const app = id
    ? await lookupApp(id, country)
    : (await searchApps(query, country, 1))[0] ?? null;

  if (!app) throw new Error("No app found for that input. Try a different name or paste the App Store link.");

  const rec = await prisma.trackedApp.upsert({
    where: {
      userId_appleId_country: { userId: user.id, appleId: String(app.trackId), country },
    },
    create: {
      userId: user.id,
      appleId: String(app.trackId),
      name: app.trackName,
      developer: app.sellerName || app.artistName,
      iconUrl: app.artworkUrl100 ?? app.artworkUrl512 ?? null,
      primaryGenre: app.primaryGenreName ?? null,
      country,
      ratingCount: app.userRatingCount || 0,
      avgRating: app.averageUserRating || 0,
      price: app.formattedPrice ?? null,
      releaseDate: app.releaseDate ? app.releaseDate.slice(0, 10) : null,
    },
    update: {
      // Refresh metadata if the app is re-added.
      name: app.trackName,
      developer: app.sellerName || app.artistName,
      iconUrl: app.artworkUrl100 ?? app.artworkUrl512 ?? null,
      ratingCount: app.userRatingCount || 0,
      avgRating: app.averageUserRating || 0,
      price: app.formattedPrice ?? null,
    },
    include: { _count: { select: { keywords: true } } },
  });

  revalidatePath("/apps");
  return appToDTO(rec);
}

/** Remove a tracked app (and cascade its keywords + snapshots). */
export async function removeTrackedApp(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.trackedApp.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/apps");
}

/** List the signed-in user's tracked apps with keyword counts. */
export async function listTrackedApps(): Promise<TrackedAppDTO[]> {
  const user = await getUser();
  if (!user) return [];
  const rows = await prisma.trackedApp.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { keywords: true } } },
  });
  return rows.map(appToDTO);
}

// ── App detail + keyword tracking ────────────────────────────────────────────

/** Fetch one app (owned by the user) with its tracked keywords + rank history. */
export async function getTrackedApp(
  id: string,
): Promise<{ app: TrackedAppDTO; keywords: AppKeywordDTO[] } | null> {
  const user = await getUser();
  if (!user) return null;

  const app = await prisma.trackedApp.findFirst({
    where: { id, userId: user.id },
    include: {
      _count: { select: { keywords: true } },
      keywords: {
        orderBy: { createdAt: "asc" },
        include: { snapshots: { orderBy: { checkedAt: "asc" } } },
      },
    },
  });
  if (!app) return null;

  const keywords: AppKeywordDTO[] = app.keywords.map((k) => {
    const history: RankPointDTO[] = k.snapshots.map((s) => ({
      position: s.position,
      checkedAt: s.checkedAt.toISOString(),
    }));
    const latest = history.length ? history[history.length - 1] : null;
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const delta =
      latest?.position != null && prev?.position != null
        ? prev.position - latest.position // positive = improved (smaller number)
        : null;
    return {
      id: k.id,
      term: k.term,
      popularity: k.popularity,
      difficulty: k.difficulty,
      difficultyLabel: k.difficultyLabel,
      position: latest?.position ?? null,
      delta,
      metricsUpdatedAt: k.metricsUpdatedAt?.toISOString() ?? null,
      history,
    };
  });

  return { app: appToDTO(app), keywords };
}

/** Add a keyword to an app: compute metrics + record the first rank snapshot. */
export async function addAppKeyword(
  appId: string,
  term: string,
): Promise<AppKeywordDTO> {
  const user = await requireUser();
  const cleanTerm = term.trim().toLowerCase();
  if (!cleanTerm) throw new Error("Keyword is required.");

  const app = await prisma.trackedApp.findFirst({ where: { id: appId, userId: user.id } });
  if (!app) throw new Error("App not found.");

  const metrics = await computeKeywordMetrics(app.appleId, cleanTerm, app.country);

  const kw = await prisma.appKeyword.upsert({
    where: { appId_term: { appId, term: cleanTerm } },
    create: {
      appId,
      term: cleanTerm,
      popularity: metrics.popularity,
      difficulty: metrics.difficulty,
      difficultyLabel: metrics.difficultyLabel,
      metricsUpdatedAt: new Date(),
      snapshots: { create: { position: metrics.position } },
    },
    update: {
      popularity: metrics.popularity,
      difficulty: metrics.difficulty,
      difficultyLabel: metrics.difficultyLabel,
      metricsUpdatedAt: new Date(),
      snapshots: { create: { position: metrics.position } },
    },
    include: { snapshots: { orderBy: { checkedAt: "asc" } } },
  });

  revalidatePath(`/apps/${appId}`);

  const history: RankPointDTO[] = kw.snapshots.map((s) => ({
    position: s.position,
    checkedAt: s.checkedAt.toISOString(),
  }));
  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const delta =
    latest?.position != null && prev?.position != null ? prev.position - latest.position : null;

  return {
    id: kw.id,
    term: kw.term,
    popularity: kw.popularity,
    difficulty: kw.difficulty,
    difficultyLabel: kw.difficultyLabel,
    position: latest?.position ?? null,
    delta,
    metricsUpdatedAt: kw.metricsUpdatedAt?.toISOString() ?? null,
    history,
  };
}

/** Remove a tracked keyword (ownership enforced via the parent app). */
export async function removeAppKeyword(id: string): Promise<void> {
  const user = await requireUser();
  // Ensure the keyword belongs to an app owned by this user before deleting.
  const kw = await prisma.appKeyword.findFirst({
    where: { id, app: { userId: user.id } },
    select: { id: true, appId: true },
  });
  if (!kw) return;
  await prisma.appKeyword.delete({ where: { id: kw.id } });
  revalidatePath(`/apps/${kw.appId}`);
}

/**
 * Re-check ranks for every keyword of an app and record fresh snapshots.
 * Used by the manual "Refresh" button (the daily cron does the same for all apps).
 */
export async function refreshAppRanks(appId: string): Promise<void> {
  const user = await requireUser();
  const app = await prisma.trackedApp.findFirst({
    where: { id: appId, userId: user.id },
    include: { keywords: true },
  });
  if (!app) throw new Error("App not found.");

  for (const kw of app.keywords) {
    const position = await findAppRank(app.appleId, kw.term, app.country);
    await prisma.rankSnapshot.create({ data: { appKeywordId: kw.id, position } });
  }

  revalidatePath(`/apps/${appId}`);
}

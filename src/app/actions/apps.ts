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

/**
 * Automatically seeds initial keywords for a newly tracked app
 * based on its name, developer name, and primary genre.
 */
async function seedKeywordsForApp(appId: string): Promise<void> {
  const app = await prisma.trackedApp.findUnique({
    where: { id: appId },
    include: { keywords: true },
  });
  if (!app || app.keywords.length > 0) return;

  const seedTerms = new Set<string>();

  // 1. Extract from App Name
  // Split by common delimiters: :, -, |, &, +, •, /, \
  const nameParts = app.name
    .split(/[:\-|&+•/\\()]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);

  for (const part of nameParts) {
    // Sanitize segment: remove special characters/emojis/quotes, leave letters, numbers, spaces
    const clean = part
      .toLowerCase()
      .replace(/['"’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    // Ensure it's a high-quality search term (e.g. 3 to 30 chars, and not too many words)
    if (clean.length >= 3 && clean.length <= 30 && clean.split(/\s+/).length <= 4) {
      seedTerms.add(clean);
    }
  }

  // Also extract specific meaningful words from name
  const stopwords = new Set([
    "for", "the", "and", "with", "app", "by", "of", "to", "in", "on", "at", "an", "a",
    "your", "my", "our", "their", "its", "is", "are", "be", "or", "as", "from", "that"
  ]);
  const words = app.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));

  if (words.length > 0) {
    // Add first single word
    seedTerms.add(words[0]);
    if (words.length > 1) {
      // Add first two words combined
      seedTerms.add(`${words[0]} ${words[1]}`);
    }
  }

  // 2. Add Developer name (cleaned up)
  const cleanDev = app.developer
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const devWords = cleanDev.split(/\s+/);
  if (devWords.length > 0 && devWords[0].length >= 3 && !stopwords.has(devWords[0])) {
    seedTerms.add(devWords[0]);
  }

  // 3. Category/Genre specific standard keywords
  const genre = app.primaryGenre || "";
  const genreLower = genre.toLowerCase();
  
  const categoryMap: Record<string, string[]> = {
    "health & fitness": ["health", "fitness", "workout", "workout planner", "daily exercise"],
    "health": ["health", "fitness", "workout", "workout planner", "daily exercise"],
    "medical": ["medical", "health tracker", "doctor", "symptoms", "health"],
    "productivity": ["productivity", "habit tracker", "calendar", "to do list", "planner"],
    "finance": ["finance", "budget", "money tracker", "expense tracker", "saving"],
    "business": ["business", "networking", "productivity", "management", "organizer"],
    "education": ["education", "learning", "study", "flashcards", "dictionary"],
    "utilities": ["utilities", "tools", "cleaner", "file manager", "qr scanner"],
    "lifestyle": ["lifestyle", "daily routine", "meditation", "self care", "mindfulness"],
    "entertainment": ["entertainment", "videos", "streaming", "movies", "fun"],
    "photo & video": ["photo editor", "video editor", "camera", "filters", "collage"],
    "shopping": ["shopping", "deals", "coupons", "store", "buy online"],
    "travel": ["travel", "flights", "hotels", "navigation", "trip planner"],
    "social networking": ["social", "chat", "messenger", "meet people", "networking"],
    "social": ["social", "chat", "messenger", "meet people", "networking"],
    "games": ["games", "arcade", "puzzle", "action game", "casual game"]
  };

  let matchedGenre = "";
  for (const key of Object.keys(categoryMap)) {
    if (genreLower.includes(key) || key.includes(genreLower)) {
      matchedGenre = key;
      break;
    }
  }

  if (matchedGenre && categoryMap[matchedGenre]) {
    categoryMap[matchedGenre].forEach((t) => seedTerms.add(t));
  }

  // Convert to Array, clean, filter, and limit to max 8 high-quality terms
  const finalTerms = Array.from(seedTerms)
    .filter((t) => t.length >= 3 && t.length <= 30)
    .slice(0, 8);

  // Seed metrics and ranks in parallel
  await Promise.allSettled(
    finalTerms.map(async (term) => {
      try {
        const metrics = await computeKeywordMetrics(app.appleId, term, app.country);
        await prisma.appKeyword.create({
          data: {
            appId: app.id,
            term,
            popularity: metrics.popularity,
            difficulty: metrics.difficulty,
            difficultyLabel: metrics.difficultyLabel,
            metricsUpdatedAt: new Date(),
            snapshots: { create: { position: metrics.position } },
          },
        });
      } catch (err) {
        console.error(`Failed to seed keyword "${term}" for app ${app.id}:`, err);
      }
    })
  );
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

  // Seed keywords if this is a newly created app tracking list
  if (rec._count.keywords === 0) {
    await seedKeywordsForApp(rec.id);
  }

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

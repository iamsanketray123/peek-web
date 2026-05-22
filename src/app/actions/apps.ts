"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
  seedStatus: string;
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
  seedStatus: string;
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
    seedStatus: a.seedStatus,
  };
}

/**
 * Automatically seeds initial keywords for a newly tracked app.
 *
 * Strategy (modeled after AppKittie):
 *  1. Extract DESCRIPTIVE words from the app name — skip the brand/trademark
 *     portion (the part before the first colon or dash).
 *  2. Generate compound search terms by combining those words with common
 *     App Store search modifiers (e.g. "exercises", "trainer", "app").
 *  3. Add high-value genre-specific keywords.
 *  4. Filter out any keyword with popularity < 20 (nobody is searching for it).
 *  5. Never add the developer's personal/company name as a keyword.
 */
async function seedKeywordsForApp(appId: string): Promise<void> {
  try {
    // 1. Update status to seeding
    await prisma.trackedApp.update({
      where: { id: appId },
      data: { seedStatus: "seeding" },
    });

    const app = await prisma.trackedApp.findUnique({
      where: { id: appId },
      include: { keywords: true },
    });
    if (!app) {
      await prisma.trackedApp.update({
        where: { id: appId },
        data: { seedStatus: "error" },
      });
      return;
    }
    if (app.keywords.length > 0) {
      await prisma.trackedApp.update({
        where: { id: appId },
        data: { seedStatus: "completed" },
      });
      return;
    }

  // ── Step 1: Separate brand from descriptive subtitle ────────────────────
  // App names often follow: "BrandName: Descriptive Subtitle"
  // or "BrandName - Descriptive Subtitle". The brand part is NOT a useful
  // search keyword (nobody searches "kegex"). We want the descriptive part.
  const nameLower = app.name.toLowerCase();
  const separatorIdx = app.name.search(/[:\-–—|]/);

  // Brand = everything before the first separator (or the entire first word)
  const brandPart = separatorIdx > 0
    ? nameLower.slice(0, separatorIdx).trim()
    : nameLower.split(/\s+/)[0];

  // Descriptive = everything after the separator, or the full name if no separator
  const descriptivePart = separatorIdx > 0
    ? nameLower.slice(separatorIdx + 1).trim()
    : nameLower;

  // Build a set of brand tokens to exclude from keyword generation
  const brandTokens = new Set(
    brandPart
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  );

  // Also exclude developer name tokens
  const devTokens = new Set(
    app.developer
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  );

  const stopwords = new Set([
    "for", "the", "and", "with", "app", "by", "of", "to", "in", "on", "at",
    "an", "a", "your", "my", "our", "their", "its", "is", "are", "be", "or",
    "as", "from", "that", "this", "all", "pro", "plus", "new", "best", "free",
    "lite", "premium", "daily", "easy", "simple", "smart", "super",
  ]);

  // ── Step 2: Extract meaningful descriptive words ────────────────────────
  const descWords = descriptivePart
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !stopwords.has(w) &&
        !brandTokens.has(w) &&
        !devTokens.has(w)
    );

  // ── Step 3: Generate candidate keywords ─────────────────────────────────
  const candidates = new Set<string>();

  // A) Multi-word descriptive phrases from subtitle segments
  // e.g. "Kegel & Pelvic Floor" → "kegel", "pelvic floor"
  const subtitleSegments = descriptivePart
    .split(/[&+,•]/)
    .map((s) => s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => {
      const words = s.split(/\s+/).filter((w) => w.length >= 3 && !stopwords.has(w));
      return words.length >= 1 && words.length <= 4 && s.length >= 3 && s.length <= 30;
    });

  for (const seg of subtitleSegments) {
    // Only add if it doesn't match a brand token exactly
    if (!brandTokens.has(seg)) {
      candidates.add(seg);
    }
  }

  // B) Individual descriptive words as standalone keywords
  for (const w of descWords) {
    candidates.add(w);
  }

  // C) Compound keywords: descriptive words + common ASO modifiers
  const modifiers = [
    "exercises", "trainer", "tracker", "app", "workout",
    "coach", "health", "guide", "routine", "plan",
  ];
  for (const w of descWords) {
    for (const mod of modifiers) {
      if (w !== mod) {
        candidates.add(`${w} ${mod}`);
      }
    }
  }

  // D) Pair descriptive words together for compound terms
  for (let i = 0; i < descWords.length; i++) {
    for (let j = 0; j < descWords.length; j++) {
      if (i !== j) {
        candidates.add(`${descWords[i]} ${descWords[j]}`);
      }
    }
  }

  // ── Step 4: Genre-specific high-value keywords ──────────────────────────
  const genre = (app.primaryGenre || "").toLowerCase();

  const genreKeywords: Record<string, string[]> = {
    "health & fitness": [
      "kegel exercises", "pelvic floor", "mens health", "prostate health",
      "bladder control", "health coach", "fitness tracker", "calorie counter",
      "daily workout", "weight loss", "gym workout", "stretching",
    ],
    "medical": [
      "health tracker", "pill reminder", "symptom checker", "blood pressure",
      "heart rate", "medical records", "first aid", "anatomy",
    ],
    "productivity": [
      "habit tracker", "to do list", "task manager", "planner",
      "calendar app", "focus timer", "pomodoro", "notes app",
      "time tracker", "goal setting",
    ],
    "finance": [
      "budget tracker", "expense tracker", "money manager", "personal finance",
      "savings goal", "bill reminder", "investment tracker", "credit score",
    ],
    "education": [
      "flashcards", "language learning", "study planner", "math solver",
      "dictionary", "vocabulary", "online courses", "homework helper",
    ],
    "lifestyle": [
      "meditation app", "mindfulness", "self care", "sleep tracker",
      "daily journal", "breathing exercises", "yoga app", "habit tracker",
    ],
    "entertainment": [
      "streaming app", "music player", "podcast app", "video player",
      "movies", "tv shows", "radio app", "audiobooks",
    ],
    "photo & video": [
      "photo editor", "video editor", "camera app", "photo filters",
      "collage maker", "background remover", "retouch", "image editor",
    ],
    "social networking": [
      "social media", "messaging app", "chat app", "video calls",
      "meet people", "dating app", "community", "friends",
    ],
    "games": [
      "puzzle game", "brain games", "word game", "strategy game",
      "offline games", "multiplayer", "arcade game", "trivia",
    ],
    "travel": [
      "trip planner", "flight tracker", "hotel booking", "navigation",
      "travel guide", "maps app", "road trip", "translator",
    ],
    "utilities": [
      "qr scanner", "calculator", "file manager", "vpn app",
      "speed test", "flashlight", "compass", "unit converter",
    ],
    "shopping": [
      "online shopping", "coupon app", "price tracker", "deals finder",
      "grocery list", "wishlist", "fashion app", "discount codes",
    ],
    "business": [
      "invoice maker", "project manager", "crm app", "meeting scheduler",
      "document scanner", "business card", "networking app", "payroll",
    ],
  };

  // Match genre — use partial matching to handle "Health & Fitness" vs "health"
  for (const [key, terms] of Object.entries(genreKeywords)) {
    if (genre.includes(key) || key.includes(genre)) {
      terms.forEach((t) => candidates.add(t));
      break;
    }
  }

  // ── Step 5: Filter and finalize ─────────────────────────────────────────
  // Remove any candidate that is purely a brand name or developer name
  const finalCandidates = Array.from(candidates).filter((term) => {
    // Skip if the term is exactly the brand name
    if (brandTokens.has(term)) return false;
    // Skip if the term is exactly a dev name token
    if (devTokens.has(term)) return false;
    // Skip very short or very long terms
    if (term.length < 3 || term.length > 35) return false;
    // Skip if every word in the term is a brand token
    const termWords = term.split(/\s+/);
    if (termWords.length > 0 && termWords.every((w) => brandTokens.has(w))) return false;
    return true;
  });

  // Limit to 20 candidates to avoid hitting Apple's rate limits
  const termsToCheck = finalCandidates.slice(0, 20);

  // ── Step 6: Resolve metrics in parallel, filter by popularity ───────────
  const results = await Promise.allSettled(
    termsToCheck.map(async (term) => {
      const metrics = await computeKeywordMetrics(app.appleId, term, app.country);
      return { term, metrics };
    })
  );

  // Collect successful results with popularity >= 20 (real search volume)
  const viable: { term: string; metrics: Awaited<ReturnType<typeof computeKeywordMetrics>> }[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      const pop = r.value.metrics.popularity ?? 0;
      if (pop >= 20) {
        viable.push(r.value);
      }
    }
  }

  // Sort by: ranked keywords first (ascending position), then by popularity desc
  viable.sort((a, b) => {
    const posA = a.metrics.position;
    const posB = b.metrics.position;
    if (posA !== null && posB !== null) return posA - posB;
    if (posA !== null) return -1;
    if (posB !== null) return 1;
    return (b.metrics.popularity ?? 0) - (a.metrics.popularity ?? 0);
  });

  // Take top 15 highest-value keywords
  const finalKeywords = viable.slice(0, 15);

  // ── Step 7: Persist to database ─────────────────────────────────────────
  await Promise.allSettled(
    finalKeywords.map(async ({ term, metrics }) => {
      try {
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

  // 2. Update status to completed and revalidate paths
  await prisma.trackedApp.update({
    where: { id: appId },
    data: { seedStatus: "completed" },
  });
  revalidatePath("/apps");
  revalidatePath(`/apps/${appId}`);
  } catch (err) {
    console.error(`Failed to seed keywords for app ${appId}:`, err);
    try {
      await prisma.trackedApp.update({
        where: { id: appId },
        data: { seedStatus: "error" },
      });
      revalidatePath("/apps");
      revalidatePath(`/apps/${appId}`);
    } catch (e) {
      console.error(`Failed to mark app ${appId} as error:`, e);
    }
  }
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
    after(async () => {
      try {
        await seedKeywordsForApp(rec.id);
      } catch (err) {
        console.error("Background seeding failed:", err);
      }
    });
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

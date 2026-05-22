"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { lookupApp, searchApps, extractAppleId } from "@/lib/aso/itunes";
import { computeKeywordMetrics, findAppRank } from "@/lib/aso/rank";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CompetitorAppDTO {
  id: string;
  appleId: string;
  name: string;
  developer: string;
  iconUrl: string | null;
  createdAt: string;
}

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
  competitors?: CompetitorAppDTO[];
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
  competitorPositions?: Record<string, number | null>;
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
  competitors?: {
    id: string;
    appleId: string;
    name: string;
    developer: string;
    iconUrl: string | null;
    createdAt: Date;
  }[];
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
    competitors: a.competitors?.map((c) => ({
      id: c.id,
      appleId: c.appleId,
      name: c.name,
      developer: c.developer,
      iconUrl: c.iconUrl,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/**
 * Automatically seeds initial keywords for a newly tracked app.
 *
 * Strategy (modeled after AppKittie), highest-signal source first:
 *  0. MINE COMPETITOR TITLES — search the niche's seed terms, then harvest the
 *     n-grams that recur across rival app titles/subtitles (the money keywords).
 *  1. Pull descriptive phrases from the app's own subtitle.
 *  2. Add curated genre-specific keywords.
 *  3. Add frequent, strong bigrams from the app's description.
 *  4. Add a few "<category word> + modifier" combos (capped, to avoid noise).
 *  5. Fall back to standalone descriptive words.
 *  Then: validate each candidate's live popularity/rank, drop low-volume terms,
 *  cap near-duplicates sharing a leading word, and keep the top ~22.
 *  Brand/developer-name tokens are never emitted as keywords. Apostrophes
 *  (straight and curly) are stripped so "Men's" never becomes "men s".
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

    // ── Fetch App Store details dynamically to extract description & additional categories ──
    const appDetails = await lookupApp(app.appleId, app.country);

    // ── Step 1: Normalize names and separate brand from descriptive subtitle ────────────────────
    // Strip apostrophes (straight ' AND curly ' U+2019 / ʼ U+02BC) so "Men's" -> "mens"
    // cleanly. The old /'s\b/ regex missed curly quotes, producing junk like "men s".
    const stripApos = (s: string) => s.replace(/[‘’ʼ']/g, "");
    const clean = (s: string) =>
      stripApos(s.toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

    const nameLower = stripApos(app.name.toLowerCase());
    const separatorIdx = nameLower.search(/[:\-–—|]/);

    // Brand = everything before the first separator (or the entire first word)
    const brandPart = separatorIdx > 0
      ? nameLower.slice(0, separatorIdx).trim()
      : nameLower.split(/\s+/)[0];

    // Descriptive = everything after the separator, or the full name if no separator
    const descriptivePart = separatorIdx > 0
      ? nameLower.slice(separatorIdx + 1).trim()
      : nameLower;

    // Define a whitelist of core/generic words that should NEVER be blocked, even if they are in the brand part
    const genericASOWords = new Set([
      "kegel", "kegels", "workout", "exercises", "trainer", "tracker", "timer",
      "health", "fitness", "weight", "diet", "calorie", "run", "walk", "sleep", "mindfulness",
      "meditation", "yoga", "habit", "tasks", "todo", "budget", "money", "finance", "study",
      "learn", "flashcards", "focus", "pomodoro", "pelvic", "floor", "prostate", "bladder",
      "control", "muscle", "muscles", "strength", "men", "mens", "women", "womens", "male",
      "female"
    ]);

    // Build a set of brand tokens to exclude from keyword generation (only exclude non-generic terms)
    const brandTokensRaw = clean(brandPart).split(/\s+/).filter((w) => w.length >= 2);
    const brandTokensToExclude = new Set(
      brandTokensRaw.filter((w) => !genericASOWords.has(w))
    );

    // Also exclude developer name tokens
    const devTokens = new Set(
      clean(app.developer).split(/\s+/).filter((w) => w.length >= 2)
    );

    const stopwords = new Set([
      "for", "the", "and", "with", "app", "by", "of", "to", "in", "on", "at",
      "an", "a", "your", "my", "our", "their", "its", "is", "are", "be", "or",
      "as", "from", "that", "this", "all", "pro", "plus", "new", "best", "free",
      "lite", "premium", "daily", "easy", "simple", "smart", "super",
    ]);

    // Weak/filler words — when an n-gram is built only from these it's low quality
    // (this is what produced "effects pelvic"). Used to gate every candidate.
    const weakWords = new Set([
      "get", "got", "use", "using", "used", "make", "makes", "made", "help", "helps",
      "helped", "want", "need", "like", "just", "more", "most", "very", "much", "good",
      "great", "now", "today", "time", "times", "day", "days", "way", "ways", "one",
      "two", "also", "first", "every", "both", "into", "over", "when", "what", "why",
      "how", "who", "will", "can", "set", "sets", "start", "starts", "keep", "keeps",
      "take", "takes", "let", "lets", "effect", "effects", "result", "results",
      "feature", "features", "version", "things", "well", "out", "off", "per",
    ]);

    // A "strong" token is meaningful enough to anchor a keyword.
    const isStrong = (w: string) =>
      w.length >= 3 &&
      !stopwords.has(w) &&
      !weakWords.has(w) &&
      !brandTokensToExclude.has(w) &&
      !devTokens.has(w);

    // ── Step 2: Extract meaningful descriptive words from the ENTIRE name ────────────────────────
    // This ensures whitelisted brand words (like "kegel" in "Dr. Kegel") participate in modifier generation
    const descWords = clean(nameLower).split(/\s+/).filter(isStrong);

    // ── Step 3: Priority-Ordered Candidate Buckets ───────────────────────────
    const bucket0 = new Map<string, number>(); // Competitor title n-grams (score = recurrence) — HIGHEST VALUE
    const bucket1 = new Set<string>(); // Direct Title/Subtitle Segments (own app)
    const bucket2 = new Set<string>(); // Dynamic NLP Description-Extracted Bigrams
    const bucket3 = new Set<string>(); // Brand Word Modifiers (e.g. whitelisted "kegel" + modifier)
    const bucket4 = new Set<string>(); // Curated Genre/Category Keywords
    const bucket5 = new Set<string>(); // Standalone Descriptive Words

    // A) BUCKET 0: Mine keywords from COMPETITOR titles/subtitles ─────────────
    // The core signal AppKittie leans on: rival apps pack their target keywords
    // into their titles, so n-grams recurring across many competitors in the same
    // niche (e.g. "pelvic floor", "bladder control") are the real money terms.
    const seedQueries: string[] = [];
    // a) Distinctive category words living in the brand (e.g. "kegel" in "Dr. Kegel")
    brandTokensRaw
      .filter((w) => genericASOWords.has(w) && w.length >= 3)
      .forEach((w) => seedQueries.push(w));
    // b) The descriptive subtitle as a short phrase (e.g. "mens health")
    const subPhrase = clean(descriptivePart).split(/\s+/).filter(isStrong).slice(0, 3).join(" ");
    if (subPhrase.length >= 3) seedQueries.push(subPhrase);
    // c) Fallback: the longest descriptive word
    if (seedQueries.length === 0 && descWords.length) {
      seedQueries.push([...descWords].sort((a, b) => b.length - a.length)[0]);
    }
    const finalSeeds = [...new Set(seedQueries)].slice(0, 2);

    for (const seed of finalSeeds) {
      let competitors: Awaited<ReturnType<typeof searchApps>> = [];
      try {
        competitors = await searchApps(seed, app.country, 50);
      } catch {
        continue; // skip a seed if Apple rate-limits; other seeds still contribute
      }
      for (const comp of competitors) {
        if (String(comp.trackId) === String(app.appleId)) continue; // skip the app itself
        // Split the competitor title on separators so brand and subtitle mine separately.
        const segments = stripApos(comp.trackName.toLowerCase()).split(/[:\-–—|()[\]]/);
        for (const seg of segments) {
          const words = seg.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(isStrong);
          for (const w of words) bucket0.set(w, (bucket0.get(w) ?? 0) + 1); // unigrams
          for (let i = 0; i < words.length - 1; i++) {
            const bg = `${words[i]} ${words[i + 1]}`;
            bucket0.set(bg, (bucket0.get(bg) ?? 0) + 2); // bigrams weighted higher
          }
        }
      }
    }

    // A) BUCKET 1: Multi-word descriptive phrases from subtitle segments
    const subtitleSegments = descriptivePart
      .replace(/'s\b/g, "s")
      .split(/[&+,•:\-–—|]/)
      .map((s) => s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim())
      .filter((s) => {
        const words = s.split(/\s+/).filter((w) => w.length >= 3 && !stopwords.has(w));
        return words.length >= 1 && words.length <= 4 && s.length >= 3 && s.length <= 30;
      });

    for (const seg of subtitleSegments) {
      const words = seg.split(/\s+/);
      if (!words.every(w => brandTokensToExclude.has(w) || stopwords.has(w))) {
        bucket1.add(seg);
      }
    }

    // B) BUCKET 2: Dynamic NLP Description-Extracted Bigrams (Unlocks keyword extraction for ANY app niche)
    const description = appDetails?.description || "";
    if (description) {
      const sentences = stripApos(description.toLowerCase())
        .split(/[.!?;\n\-\u2022]/)
        .map(s => s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim())
        .filter(s => s.length > 5);

      const bigramCounts: Record<string, number> = {};

      for (const sentence of sentences) {
        const words = sentence.split(/\s+/);
        for (let i = 0; i < words.length - 1; i++) {
          const w1 = words[i];
          const w2 = words[i + 1];
          // BOTH words must be strong \u2014 kills junk bigrams like "effects pelvic".
          if (!isStrong(w1) || !isStrong(w2)) continue;
          const bigram = `${w1} ${w2}`;
          bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
        }
      }

      // Require >= 3 occurrences (raised from 2) to keep only genuinely repeated phrases.
      Object.entries(bigramCounts)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([bigram]) => bucket2.add(bigram));
    }

    // C) BUCKET 3: Limited brand-word + modifier combos.
    // Only the single strongest category word (e.g. "kegel") gets a few modifiers,
    // instead of flooding the list with near-duplicate "<word> X" combinations.
    const primaryWord = descWords.find((w) => brandPart.includes(w)) ?? descWords[0];
    if (primaryWord) {
      for (const mod of ["exercises", "trainer", "workout", "app"]) {
        if (primaryWord !== mod) bucket3.add(`${primaryWord} ${mod}`);
      }
    }

    // D) BUCKET 4: Genre-specific high-value keywords (Fallback dictionary)
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

    // Use primary genre + all extra genres from App Store details to look up seeds
    const genresToCheck = new Set<string>();
    if (app.primaryGenre) genresToCheck.add(app.primaryGenre.toLowerCase());
    if (appDetails?.genres) {
      appDetails.genres.forEach(g => genresToCheck.add(g.toLowerCase()));
    }

    for (const genreName of genresToCheck) {
      for (const [key, terms] of Object.entries(genreKeywords)) {
        if (genreName.includes(key) || key.includes(genreName)) {
          terms.forEach((t) => bucket4.add(t));
        }
      }
    }

    // E) BUCKET 5: Standalone Descriptive Words (lowest priority fallback)
    for (const w of descWords) {
      bucket5.add(w);
    }

    // ── Step 4: Strict Priority-Preserving Deduplication & Merge ──────────────
    const allCandidatesOrdered = new Set<string>();
    const addCandidate = (raw: string) => {
      const term = raw.trim().toLowerCase();
      if (brandTokensToExclude.has(term)) return;
      if (devTokens.has(term)) return;
      if (term.length < 3 || term.length > 35) return;
      const termWords = term.split(/\s+/);
      // Drop terms made entirely of brand/dev tokens, or with no strong word at all.
      if (termWords.every((w) => brandTokensToExclude.has(w) || devTokens.has(w))) return;
      if (!termWords.some(isStrong)) return;
      allCandidatesOrdered.add(term);
    };
    const addBucket = (bucketSet: Set<string>) => bucketSet.forEach(addCandidate);

    // Priority order: competitor-mined n-grams first (the highest-signal source),
    // then the app's own subtitle, curated genre terms, description bigrams,
    // brand combos, and finally standalone words.
    [...bucket0.entries()]
      .filter(([, score]) => score >= 2) // term must recur across competitor titles
      .sort((a, b) => b[1] - a[1])
      .forEach(([term]) => addCandidate(term));
    addBucket(bucket1);
    addBucket(bucket4);
    addBucket(bucket2);
    addBucket(bucket3);
    addBucket(bucket5);

    // Validate the top candidates (cap protects Apple's Search API rate limits).
    const termsToCheck = Array.from(allCandidatesOrdered).slice(0, 26);

    // ── Step 5: Parallel Metric Compilation & Smart Selection ────────────────────
    const results = await Promise.allSettled(
      termsToCheck.map(async (term) => {
        const metrics = await computeKeywordMetrics(app.appleId, term, app.country);
        return { term, metrics };
      })
    );

    // Collect terms matching ASO search-volume criteria:
    // popularity >= 20, OR a real ranking term with some volume (pop >= 14 AND ranked in top 150).
    const viable: { term: string; metrics: Awaited<ReturnType<typeof computeKeywordMetrics>> }[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        const pop = r.value.metrics.popularity ?? 0;
        const pos = r.value.metrics.position;
        if (pop >= 20 || (pop >= 14 && pos !== null && pos <= 150)) {
          viable.push(r.value);
        }
      }
    }

    // Sort by: ranked keywords first (ascending position), then by popularity descending
    viable.sort((a, b) => {
      const posA = a.metrics.position;
      const posB = b.metrics.position;
      if (posA !== null && posB !== null) return posA - posB;
      if (posA !== null) return -1;
      if (posB !== null) return 1;
      return (b.metrics.popularity ?? 0) - (a.metrics.popularity ?? 0);
    });

    // Diversity cap: at most 3 keywords may share the same leading word, so the
    // list isn't swamped by near-duplicate "<brand> X" terms (e.g. five "kegel ___").
    const leadCounts: Record<string, number> = {};
    const diversified: typeof viable = [];
    for (const v of viable) {
      const lead = v.term.split(/\s+/)[0];
      leadCounts[lead] = (leadCounts[lead] ?? 0) + 1;
      if (leadCounts[lead] <= 3) diversified.push(v);
    }

    // Take the top 22 highest-value, diversified keywords.
    const finalKeywords = diversified.slice(0, 22);

    // ── Step 6: Persist Seeding to Database ─────────────────────────────────────────
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

    // Revalidate and update status
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
      competitors: {
        orderBy: { createdAt: "asc" },
      },
      keywords: {
        orderBy: { createdAt: "asc" },
        include: {
          snapshots: { orderBy: { checkedAt: "asc" } },
          competitorSnapshots: { orderBy: { checkedAt: "asc" } },
        },
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

    // Map latest competitor positions
    const competitorPositions: Record<string, number | null> = {};
    const latestCompSnapshots: Record<string, number | null> = {};
    for (const snap of k.competitorSnapshots) {
      latestCompSnapshots[snap.competitorId] = snap.position;
    }
    for (const comp of app.competitors) {
      competitorPositions[comp.appleId] = latestCompSnapshots[comp.id] ?? null;
    }

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
      competitorPositions,
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

  const competitors = await prisma.competitorApp.findMany({
    where: { trackedAppId: appId }
  });
  const competitorAppleIds = competitors.map(c => c.appleId);

  const metrics = await computeKeywordMetrics(app.appleId, cleanTerm, app.country, competitorAppleIds);

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

  if (metrics.competitorPositions) {
    for (const comp of competitors) {
      const compPos = metrics.competitorPositions[comp.appleId] ?? null;
      await prisma.competitorRankSnapshot.create({
        data: {
          competitorId: comp.id,
          appKeywordId: kw.id,
          position: compPos
        }
      });
    }
  }

  revalidatePath(`/apps/${appId}`);

  const history: RankPointDTO[] = kw.snapshots.map((s) => ({
    position: s.position,
    checkedAt: s.checkedAt.toISOString(),
  }));
  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const delta =
    latest?.position != null && prev?.position != null ? prev.position - latest.position : null;

  const competitorPositions: Record<string, number | null> = {};
  if (metrics.competitorPositions) {
    for (const comp of competitors) {
      competitorPositions[comp.appleId] = metrics.competitorPositions[comp.appleId] ?? null;
    }
  }

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
    competitorPositions,
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

  // 1. Update status to seeding (refreshing) instantly to trigger visual loaders
  await prisma.trackedApp.update({
    where: { id: appId },
    data: { seedStatus: "seeding" },
  });
  revalidatePath("/apps");
  revalidatePath(`/apps/${appId}`);

  // 2. Offload rank check or seeding to background
  after(async () => {
    try {
      if (app.keywords.length === 0) {
        // Re-run full seeding using our dynamic NLP seed engine
        await seedKeywordsForApp(appId);
        return;
      }

      const competitors = await prisma.competitorApp.findMany({
        where: { trackedAppId: appId }
      });
      const competitorAppleIds = competitors.map(c => c.appleId);

      for (const kw of app.keywords) {
        const metrics = await computeKeywordMetrics(app.appleId, kw.term, app.country, competitorAppleIds);
        
        await prisma.rankSnapshot.create({
          data: { appKeywordId: kw.id, position: metrics.position }
        });

        if (metrics.competitorPositions) {
          for (const comp of competitors) {
            const compPos = metrics.competitorPositions[comp.appleId] ?? null;
            await prisma.competitorRankSnapshot.create({
              data: {
                competitorId: comp.id,
                appKeywordId: kw.id,
                position: compPos
              }
            });
          }
        }
      }

      // Mark completed
      await prisma.trackedApp.update({
        where: { id: appId },
        data: { seedStatus: "completed" },
      });
    } catch (err) {
      console.error("Background refresh failed:", err);
      await prisma.trackedApp.update({
        where: { id: appId },
        data: { seedStatus: "completed" },
      });
    } finally {
      revalidatePath("/apps");
      revalidatePath(`/apps/${appId}`);
    }
  });
}

// ── Competitor Management ──────────────────────────────────────────────────

/**
 * Add a competitor to track. Resolves competitor app details via iTunes search,
 * stores the competitor under the parent tracked app, and builds historical
 * ranks for all currently tracked keywords of that app in the background.
 */
export async function addCompetitorApp(
  trackedAppId: string,
  competitorQuery: string
): Promise<CompetitorAppDTO> {
  const user = await requireUser();
  const query = competitorQuery.trim();
  if (!query) throw new Error("Enter an App Store URL, ID, or app name.");

  // Verify ownership of the trackedApp
  const trackedApp = await prisma.trackedApp.findFirst({
    where: { id: trackedAppId, userId: user.id },
    include: { competitors: true }
  });
  if (!trackedApp) throw new Error("App not found.");

  // Enforce max 5 competitors limit
  if (trackedApp.competitors.length >= 5) {
    throw new Error("You can track up to 5 competitors per app.");
  }

  // Resolve competitor app details using itunes api
  const id = extractAppleId(query);
  const app = id
    ? await lookupApp(id, trackedApp.country)
    : (await searchApps(query, trackedApp.country, 1))[0] ?? null;

  if (!app) throw new Error("No competitor app found. Try a different name or App Store link.");

  const competitorAppleId = String(app.trackId);
  if (competitorAppleId === trackedApp.appleId) {
    throw new Error("You cannot add the main tracked app as a competitor.");
  }

  // Check if already tracking this competitor for this app
  const existing = trackedApp.competitors.find(c => c.appleId === competitorAppleId);
  if (existing) {
    throw new Error("This competitor is already being tracked.");
  }

  // Create competitor app record
  const competitor = await prisma.competitorApp.create({
    data: {
      trackedAppId,
      appleId: competitorAppleId,
      name: app.trackName,
      developer: app.sellerName || app.artistName,
      iconUrl: app.artworkUrl100 ?? app.artworkUrl512 ?? null,
    }
  });

  // Background action: Fetch historical/current rank snapshots for this competitor across ALL current tracked keywords
  after(async () => {
    try {
      const keywords = await prisma.appKeyword.findMany({
        where: { appId: trackedAppId }
      });
      for (const kw of keywords) {
        const position = await findAppRank(competitorAppleId, kw.term, trackedApp.country);
        await prisma.competitorRankSnapshot.create({
          data: {
            competitorId: competitor.id,
            appKeywordId: kw.id,
            position
          }
        });
      }
    } catch (err) {
      console.error("Failed to populate competitor snapshots in background:", err);
    }
  });

  revalidatePath(`/apps/${trackedAppId}`);
  return {
    id: competitor.id,
    appleId: competitor.appleId,
    name: competitor.name,
    developer: competitor.developer,
    iconUrl: competitor.iconUrl,
    createdAt: competitor.createdAt.toISOString()
  };
}

/**
 * Remove a tracked competitor app (cascades deletion of competitor rank snapshots).
 */
export async function removeCompetitorApp(competitorId: string): Promise<void> {
  const user = await requireUser();
  
  // Find competitor first to verify ownership of parent tracked app
  const competitor = await prisma.competitorApp.findFirst({
    where: { id: competitorId, trackedApp: { userId: user.id } },
    select: { id: true, trackedAppId: true }
  });
  if (!competitor) throw new Error("Competitor not found or access denied.");

  await prisma.competitorApp.delete({
    where: { id: competitorId }
  });

  revalidatePath(`/apps/${competitor.trackedAppId}`);
}

// ── Global Storefront Matrix ────────────────────────────────────────────────

export interface GlobalRankPoint {
  country: string;
  position: number | null;
  popularity: number | null;
  difficulty: number | null;
}

/**
 * Computes organic rank and metric popularity across multiple global storefronts.
 */
export async function getGlobalRankMatrix(
  appId: string,
  term: string,
  countries: string[]
): Promise<GlobalRankPoint[]> {
  const user = await requireUser();
  const app = await prisma.trackedApp.findFirst({
    where: { id: appId, userId: user.id }
  });
  if (!app) throw new Error("App not found.");

  const cleanTerm = term.trim().toLowerCase();

  const results = await Promise.all(
    countries.map(async (country) => {
      try {
        const metrics = await computeKeywordMetrics(app.appleId, cleanTerm, country);
        return {
          country,
          position: metrics.position,
          popularity: metrics.popularity,
          difficulty: metrics.difficulty,
        };
      } catch (err) {
        console.error(`Failed to lookup global rank in ${country}:`, err);
        return {
          country,
          position: null,
          popularity: null,
          difficulty: null,
        };
      }
    })
  );

  return results;
}

// ── AI Metadata Optimizer ───────────────────────────────────────────────────

export interface OptimizedMetadata {
  title: string;
  subtitle: string;
  keywords: string;
  explanation: string[];
}

/**
 * Automatically builds optimized Titles, Subtitles, and 100-character keyword sets
 * using target generic search volumes and strict non-duplication constraints.
 */
export async function generateOptimizedMetadata(
  appId: string
): Promise<OptimizedMetadata> {
  const user = await requireUser();
  const app = await prisma.trackedApp.findFirst({
    where: { id: appId, userId: user.id },
    include: { keywords: true }
  });
  if (!app) throw new Error("App not found.");

  // Pick keywords that have popularity sorted descending
  const sortedKws = [...app.keywords]
    .filter(k => k.popularity != null)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  // Determine Brand Token (first word of name, e.g. "Dr. Kegel" -> "Dr. Kegel")
  const brandClean = app.name.split(/[:\-–—|]/)[0].trim();
  let title = brandClean;

  // Find high-value generic terms to append to Title if they fit within 30 chars
  const titleCandidates = sortedKws.map(k => k.term);
  for (const cand of titleCandidates) {
    if (cand.length > 18) continue;
    const testTitle = `${brandClean}: ${cand}`;
    if (testTitle.length <= 30 && testTitle.toLowerCase() !== app.name.toLowerCase()) {
      title = testTitle;
      break;
    }
  }

  if (title.length > 30) {
    title = title.slice(0, 30).trim();
  }

  // Generate Subtitle: combine high-scoring descriptive tokens under 30 chars
  const selectedSubWords: string[] = [];
  let subtitle = "";
  
  const tokenScores: Record<string, number> = {};
  for (const k of sortedKws) {
    const words = k.term.split(/\s+/);
    for (const w of words) {
      if (w.length >= 3) {
        tokenScores[w] = (tokenScores[w] ?? 0) + (k.popularity ?? 10);
      }
    }
  }

  const sortedTokens = Object.entries(tokenScores)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  for (const t of sortedTokens) {
    const capToken = t.charAt(0).toUpperCase() + t.slice(1);
    if (title.toLowerCase().includes(t.toLowerCase())) continue;
    if (selectedSubWords.includes(capToken)) continue;

    const testWords = [...selectedSubWords, capToken];
    let testSub = "";
    if (testWords.length === 1) {
      testSub = testWords[0];
    } else if (testWords.length === 2) {
      testSub = testWords.join(" & ");
    } else {
      testSub = `${testWords.slice(0, -1).join(", ")} & ${testWords[testWords.length - 1]}`;
    }

    if (testSub.length <= 30) {
      selectedSubWords.push(capToken);
      subtitle = testSub;
    }
  }

  if (!subtitle) {
    subtitle = "Exercises, Workout & Tracker".slice(0, 30);
  }

  // Generate 100-character keyword field
  const titleTokens = new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  const subtitleTokens = new Set(subtitle.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  
  const kwTokens: string[] = [];
  const addedKwTokens = new Set<string>();

  for (const k of sortedKws) {
    const words = k.term.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
    for (const w of words) {
      if (w.length < 2) continue;
      if (titleTokens.has(w) || subtitleTokens.has(w)) continue;
      if (addedKwTokens.has(w)) continue;

      const currentString = [...kwTokens, w].join(",");
      if (currentString.length <= 100) {
        kwTokens.push(w);
        addedKwTokens.add(w);
      }
    }
  }

  const keywordString = kwTokens.join(",");

  const explanation = [
    `🏷️ Created Title: "${title}" (${title.length}/30 characters) packed with your top organic keywords.`,
    `✍️ Composed Subtitle: "${subtitle}" (${subtitle.length}/30 characters) utilizing popular modifiers to capture search intent.`,
    `🤫 Constructed a 100-character Keyword list: "${keywordString}" (${keywordString.length}/100 characters).`,
    `💡 ASO Gold Rule: Fully removed duplicate words that are already in the Title or Subtitle (Apple indexes those automatically!), saving valuable space to target extra niche terms.`
  ];

  return {
    title,
    subtitle,
    keywords: keywordString,
    explanation,
  };
}

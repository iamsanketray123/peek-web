/**
 * Apple customer-reviews client.
 *
 * Uses the free, key-free RSS feed (no Apple credentials, no cost):
 *   https://itunes.apple.com/{country}/rss/customerreviews/page={n}/id={appId}/sortby=mostrecent/json
 *
 * Returns up to 50 reviews per page. We page through a handful of pages to gather
 * the most-recent reviews. Two important limits to be honest about:
 *   - The feed is storefront-scoped (per country); reviews from other countries
 *     aren't included.
 *   - Apple only exposes roughly the most-recent ~500 reviews here, NOT the full
 *     historical corpus. So the distribution below reflects *recent sentiment*,
 *     not the app's lifetime rating (use lookupApp for the lifetime average).
 *
 * Responses are cached via the Next.js data cache (revalidate) since Apple
 * throttles aggressively.
 */
import { ITunesError } from "./itunes";

/** Normalized review used by the API + UI. */
export interface Review {
  id: string;
  author: string;
  /** 1–5 stars. */
  rating: number;
  title: string;
  content: string;
  /** App version the review was left on (e.g. "12.3.0"), or null. */
  version: string | null;
  /** ISO timestamp the review was last updated. */
  updated: string;
  /** Net helpful votes (helpful − unhelpful). */
  voteSum: number;
  /** Total helpful votes cast. */
  voteCount: number;
}

export interface ReviewSummary {
  /** Reviews actually fetched (recent window, not lifetime). */
  count: number;
  /** Mean rating across the fetched reviews. */
  average: number;
  /** Count of reviews per star rating (1–5). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** The app a set of reviews belongs to (from the iTunes lookup endpoint). */
export interface ReviewedApp {
  appleId: string;
  name: string;
  developer: string;
  icon: string | null;
  /** Lifetime average rating (from lookup, NOT the recent-window mean). */
  avgRating: number;
  /** Lifetime rating count. */
  ratingCount: number;
  genre: string | null;
  url: string | null;
  country: string;
}

/** Raw RSS-JSON shapes (every field is optional — Apple's shape varies). */
interface Labeled {
  label?: string;
}
interface RawReviewEntry {
  id?: Labeled;
  author?: { name?: Labeled };
  "im:rating"?: Labeled;
  "im:version"?: Labeled;
  "im:voteSum"?: Labeled;
  "im:voteCount"?: Labeled;
  title?: Labeled;
  content?: Labeled;
  updated?: Labeled;
}
interface RssResponse {
  feed?: {
    // `entry` is absent (no reviews), a single object (one review), or an array.
    entry?: RawReviewEntry | RawReviewEntry[];
  };
}

// 30 min — matches the iTunes client; long enough to spare Apple's API on repeat
// loads, short enough that fresh reviews surface within the same session window.
const CACHE_SECONDS = 60 * 30;
const PER_PAGE = 50;
/** Apple's feed tops out around 10 pages (~500 reviews). */
const DEFAULT_MAX_PAGES = 6;

function toReview(e: RawReviewEntry): Review | null {
  const ratingStr = e["im:rating"]?.label;
  // The first feed entry is app metadata, not a review — it has no rating.
  if (ratingStr == null) return null;
  const rating = Number(ratingStr);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;

  return {
    id: e.id?.label ?? cryptoRandom(),
    author: e.author?.name?.label?.trim() || "Anonymous",
    rating,
    title: e.title?.label?.trim() ?? "",
    content: e.content?.label?.trim() ?? "",
    version: e["im:version"]?.label ?? null,
    updated: e.updated?.label ?? "",
    voteSum: Number(e["im:voteSum"]?.label ?? 0) || 0,
    voteCount: Number(e["im:voteCount"]?.label ?? 0) || 0,
  };
}

// Fallback id for the rare entry missing one; keeps React keys stable per fetch.
function cryptoRandom(): string {
  return "rev_" + Math.random().toString(36).slice(2);
}

async function fetchPage(
  appleId: string,
  country: string,
  page: number,
): Promise<Review[]> {
  const url =
    `https://itunes.apple.com/${encodeURIComponent(country)}/rss/customerreviews/` +
    `page=${page}/id=${encodeURIComponent(appleId)}/sortby=mostrecent/json`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "PeekWeb/0.1 (+aso research)" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (e) {
    throw new ITunesError(`Network error fetching reviews: ${(e as Error).message}`);
  }
  if (res.status === 403 || res.status === 429) {
    throw new ITunesError("Apple rate-limited the reviews feed. Try again in a moment.");
  }
  if (!res.ok) {
    throw new ITunesError(`Apple reviews feed returned ${res.status}.`);
  }

  const data = (await res.json()) as RssResponse;
  const raw = data.feed?.entry;
  if (!raw) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.map(toReview).filter((r): r is Review => r !== null);
}

/**
 * Fetch the most-recent reviews for an app, paging through the feed.
 * Page 1 is fetched first; if it's full, the remaining pages are fetched in
 * parallel (Apple serves each page as a separately-cacheable URL).
 */
export async function fetchReviews(
  appleId: string | number,
  country = "us",
  maxPages = DEFAULT_MAX_PAGES,
): Promise<Review[]> {
  const id = String(appleId);
  const first = await fetchPage(id, country, 1);
  // Short first page ⇒ no further pages exist.
  if (first.length < PER_PAGE || maxPages <= 1) return dedupe(first);

  const pages = Array.from({ length: maxPages - 1 }, (_, i) => i + 2);
  const rest = await Promise.all(
    // Tolerate per-page failures (a rate-limited page shouldn't nuke the whole set).
    pages.map((p) => fetchPage(id, country, p).catch(() => [] as Review[])),
  );
  return dedupe([first, ...rest].flat());
}

function dedupe(reviews: Review[]): Review[] {
  const seen = new Set<string>();
  const out: Review[] = [];
  for (const r of reviews) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Rating distribution + mean across a set of reviews. */
export function summarize(reviews: Review[]): ReviewSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[star] += 1;
    total += r.rating;
  }
  return {
    count: reviews.length,
    average: reviews.length ? total / reviews.length : 0,
    distribution,
  };
}

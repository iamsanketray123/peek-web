/**
 * iTunes Search API client.
 *
 * Uses only the public, key-free endpoints:
 *   - https://itunes.apple.com/search   (keyword -> ranked apps)
 *   - https://itunes.apple.com/lookup   (appId -> app metadata)
 *
 * Apple throttles aggressively, so responses are cached via the Next.js
 * data cache (revalidate). A DB-backed CompetitorCache comes later (see PLAN.md).
 */

/** Normalized competitor/app shape used by the scoring engine + UI. */
export interface Competitor {
  trackId: number;
  trackName: string;
  sellerName: string;
  artistName: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  primaryGenreName?: string;
  userRatingCount: number;
  averageUserRating: number;
  releaseDate?: string;
  price?: number;
  formattedPrice?: string;
  trackViewUrl?: string;
  bundleId?: string;
  description?: string;
  genres?: string[];
}

/** Raw iTunes API result (fields are optional — Apple's shape varies). */
interface RawResult {
  trackId?: number;
  trackName?: string;
  sellerName?: string;
  artistName?: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  primaryGenreName?: string;
  userRatingCount?: number;
  averageUserRating?: number;
  releaseDate?: string;
  price?: number;
  formattedPrice?: string;
  trackViewUrl?: string;
  bundleId?: string;
  description?: string;
  genres?: string[];
}

interface ITunesResponse {
  resultCount: number;
  results: RawResult[];
}

// 30 min: short enough that stale iTunes orderings don't persist across user sessions,
// long enough to avoid hammering Apple's API on repeated same-keyword lookups.
const CACHE_SECONDS = 60 * 30;

function normalize(r: RawResult): Competitor {
  return {
    trackId: r.trackId ?? 0,
    trackName: r.trackName ?? "",
    sellerName: r.sellerName ?? r.artistName ?? "",
    artistName: r.artistName ?? "",
    artworkUrl100: r.artworkUrl100,
    artworkUrl512: r.artworkUrl512 ?? r.artworkUrl100,
    primaryGenreName: r.primaryGenreName,
    userRatingCount: r.userRatingCount ?? 0,
    averageUserRating: r.averageUserRating ?? 0,
    releaseDate: r.releaseDate,
    price: r.price,
    formattedPrice: r.formattedPrice,
    trackViewUrl: r.trackViewUrl,
    bundleId: r.bundleId,
    description: r.description,
    genres: r.genres,
  };
}

export class ITunesError extends Error {}

async function fetchJson(url: string): Promise<ITunesResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "PeekWeb/0.1 (+aso research)" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (e) {
    throw new ITunesError(`Network error contacting iTunes: ${(e as Error).message}`);
  }
  if (res.status === 403 || res.status === 429) {
    throw new ITunesError("iTunes API rate-limited. Try again in a moment.");
  }
  if (!res.ok) {
    throw new ITunesError(`iTunes API returned ${res.status}.`);
  }
  return (await res.json()) as ITunesResponse;
}

/**
 * Search apps for a keyword.
 * NOTE: iTunes Search API does NOT return results in App Store search-rank order —
 * its ordering is internal to Apple and varies between calls. Callers that need
 * a stable display order should re-sort by ratingCount or another metric.
 */
export async function searchApps(
  term: string,
  country = "us",
  limit = 50,
): Promise<Competitor[]> {
  const url =
    "https://itunes.apple.com/search?" +
    new URLSearchParams({
      term,
      country,
      media: "software",
      entity: "software",
      limit: String(limit),
    }).toString();
  const data = await fetchJson(url);
  return data.results.map(normalize).filter((c) => c.trackId > 0);
}

/** Look up a single app by its numeric App Store ID. */
export async function lookupApp(
  appleId: string,
  country = "us",
): Promise<Competitor | null> {
  const url =
    "https://itunes.apple.com/lookup?" +
    new URLSearchParams({ id: appleId, country }).toString();
  const data = await fetchJson(url);
  const first = data.results[0];
  return first ? normalize(first) : null;
}

/**
 * Extract an App Store numeric ID from any input the user might paste:
 *   https://apps.apple.com/us/app/foo/id123456789  |  id123456789  |  123456789
 * (Ported from Peek's ITunesSearchService.extractAppleID.)
 */
export function extractAppleId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/id(\d+)/);
  return m ? m[1] : null;
}

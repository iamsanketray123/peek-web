/**
 * App rank lookup + per-app keyword metrics (Phase 3 — App Tracking).
 *
 * Finding an app's position for a keyword:
 *   We query the public iTunes Search API with a deep limit (200) and locate
 *   the app's trackId in the returned list. Apple returns these results in its
 *   own relevance ordering (NOT rating-sorted — verified), which is a solid,
 *   free proxy for App Store search rank. The ordering is stable across calls
 *   within the cache window, so day-over-day deltas are meaningful.
 *
 *   This is isolated here so it can later be swapped for true App Store SSR
 *   parsing without touching callers (see PLAN.md §6 risks).
 */
import { searchApps, type Competitor } from "./itunes";
import { estimatePopularity, calcDifficulty } from "./scoring";

// How deep we look for the app. The App Store search UI rarely surfaces apps
// past ~200 for a query, so "not in top 200" ≈ "not ranked" for our purposes.
const RANK_DEPTH = 200;

export interface KeywordMetrics {
  popularity: number | null;
  difficulty: number;
  difficultyLabel: string;
  /** 1-based rank of the app for this term, or null if not ranked in top 200. */
  position: number | null;
  /** Total apps returned for the term (coverage signal). */
  resultCount: number;
}

/**
 * Compute popularity + difficulty for a term AND find the app's rank — all from
 * a single search call (avoids hammering Apple's API twice).
 *
 * Scoring is computed from the top 50 results to stay consistent with the
 * Keyword Explorer (which scores on 50); rank is searched across the full set.
 */
export async function computeKeywordMetrics(
  appleId: string | number,
  term: string,
  country = "us",
  competitorAppleIds?: string[],
): Promise<KeywordMetrics & { competitorPositions?: Record<string, number | null> }> {
  const results: Competitor[] = await searchApps(term, country, RANK_DEPTH);

  const idNum = Number(appleId);
  const idx = results.findIndex((c) => c.trackId === idNum);
  const position = idx === -1 ? null : idx + 1;

  // Score on the top 50 to match Keyword Explorer's basis.
  const top = results.slice(0, 50);
  const popularity = estimatePopularity(top, term);
  const diff = calcDifficulty(top, term);

  const competitorPositions: Record<string, number | null> = {};
  if (competitorAppleIds) {
    for (const cId of competitorAppleIds) {
      const cNum = Number(cId);
      const cIdx = results.findIndex((c) => c.trackId === cNum);
      competitorPositions[cId] = cIdx === -1 ? null : cIdx + 1;
    }
  }

  return {
    popularity,
    difficulty: diff.score,
    difficultyLabel: diff.label,
    position,
    resultCount: results.length,
    competitorPositions,
  };
}

/** Lightweight rank-only lookup (used by the daily cron). */
export async function findAppRank(
  appleId: string | number,
  term: string,
  country = "us",
): Promise<number | null> {
  const results = await searchApps(term, country, RANK_DEPTH);
  const idNum = Number(appleId);
  const idx = results.findIndex((c) => c.trackId === idNum);
  return idx === -1 ? null : idx + 1;
}

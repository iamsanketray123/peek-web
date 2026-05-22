/**
 * Keyword analysis orchestration: iTunes data -> scoring engine -> result.
 * Used by the /api/keywords/analyze route (and reusable elsewhere).
 */
import { searchApps, type Competitor } from "./itunes";
import {
  estimatePopularity,
  calcDifficulty,
  calcOpportunity,
  getTargeting,
  estimateDownloads,
  type DifficultyResult,
  type Targeting,
} from "./scoring";

export interface RankedApp {
  rank: number;
  trackId: number;
  name: string;
  developer: string;
  icon?: string;
  rating: number;
  ratingCount: number;
  genre?: string;
  releaseDate?: string;
  price?: string;
  url?: string;
  estDownloadsLow: number;
  estDownloadsHigh: number;
}

export interface KeywordAnalysis {
  keyword: string;
  country: string;
  popularity: number | null;
  difficulty: number;
  difficultyLabel: string;
  difficultyTiers: DifficultyResult["tiers"];
  opportunity: number;
  targeting: Targeting;
  dailySearches: number;
  resultCount: number;
  apps: RankedApp[];
}

export async function analyzeKeyword(term: string, country = "us"): Promise<KeywordAnalysis> {
  const keyword = term.trim();

  // Fetch 50 apps — more coverage means better scoring signal AND fewer
  // "why is X missing?" surprises (iTunes returns a different 20 each call).
  const competitors: Competitor[] = await searchApps(keyword, country, 50);

  // Scoring uses the full competitor set (all 50).
  const popularity = estimatePopularity(competitors, keyword);
  const diff = calcDifficulty(competitors, keyword);
  const opportunity = calcOpportunity(popularity ?? 0, diff.score);
  const targeting = getTargeting(popularity ?? 0, diff.score);
  const downloads = estimateDownloads(popularity ?? 0, country);

  // For display: sort by ratingCount descending so the strongest, most
  // established apps always appear at the top — regardless of iTunes'
  // non-deterministic internal ordering. This ensures that high-profile
  // apps (e.g. Dr. Kegel with 40K ratings) are never hidden by lower-rated
  // apps that happened to land higher in a particular iTunes API response.
  const sortedForDisplay = [...competitors]
    .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
    .slice(0, 10);

  const apps: RankedApp[] = sortedForDisplay.map((c, i) => {
    const pos = downloads.positions[i];
    return {
      rank: i + 1,
      trackId: c.trackId,
      name: c.trackName,
      developer: c.sellerName || c.artistName,
      icon: c.artworkUrl100 ?? c.artworkUrl512,
      rating: Math.round((c.averageUserRating || 0) * 10) / 10,
      ratingCount: c.userRatingCount || 0,
      genre: c.primaryGenreName,
      releaseDate: c.releaseDate ? c.releaseDate.slice(0, 10) : undefined,
      price: c.formattedPrice,
      url: c.trackViewUrl,
      estDownloadsLow: pos?.downloadsLow ?? 0,
      estDownloadsHigh: pos?.downloadsHigh ?? 0,
    };
  });

  return {
    keyword,
    country,
    popularity,
    difficulty: diff.score,
    difficultyLabel: diff.label,
    difficultyTiers: diff.tiers,
    opportunity,
    targeting,
    dailySearches: downloads.dailySearches,
    resultCount: competitors.length, // total apps found (up to 50)
    apps,
  };
}

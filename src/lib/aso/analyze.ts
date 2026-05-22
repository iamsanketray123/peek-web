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
  const competitors: Competitor[] = await searchApps(keyword, country, 20);

  const popularity = estimatePopularity(competitors, keyword);
  const diff = calcDifficulty(competitors, keyword);
  const opportunity = calcOpportunity(popularity ?? 0, diff.score);
  const targeting = getTargeting(popularity ?? 0, diff.score);
  const downloads = estimateDownloads(popularity ?? 0, country);

  const apps: RankedApp[] = competitors.slice(0, 10).map((c, i) => {
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
    resultCount: competitors.length,
    apps,
  };
}

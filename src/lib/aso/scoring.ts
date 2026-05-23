/**
 * ASO scoring engine — TypeScript port of respectaso's algorithms.
 *
 * Everything is derived from the free iTunes Search API competitor data.
 * All numbers are ESTIMATES (Apple does not publish search volumes).
 *
 * Ported from ~/Documents/respectaso/aso/{scoring.py,services.py}:
 *   - PopularityEstimator   (6 signals, 5–100)
 *   - DifficultyCalculator  (7 weighted sub-scores, 1–100, + Top 5/10/20 tiers)
 *   - DownloadEstimator     (popularity -> searches -> downloads/position)
 *   - calc_opportunity / classify_keyword / get_targeting_advice
 *
 * NOTE (v1 approximations vs respectaso):
 *   - The finance-intent relevance guard is omitted.
 *   - Difficulty post-processing caps use reasonable thresholds (documented
 *     behavior; exact constants not transcribed). Refine against parity later.
 */
import type { Competitor } from "./itunes";

// ───────────────────────── helpers ─────────────────────────

function tokenize(s: string): string[] {
  return (s ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[n >> 1] : (s[(n >> 1) - 1] + s[n >> 1]) / 2;
}

/** Log-interpolated band score (mirrors respectaso: first band linear from 0). */
function logBands(value: number, bands: [number, number][]): number {
  for (let i = 0; i < bands.length; i++) {
    const [threshold, score] = bands[i];
    if (value < threshold) {
      if (i === 0) return (value / threshold) * score;
      const [pt, ps] = bands[i - 1];
      const ratio = Math.log(value / pt) / Math.log(threshold / pt);
      return ps + ratio * (score - ps);
    }
  }
  return bands[bands.length - 1][1];
}

/** Linear-interpolated band score (first band linear from 0). */
function linearBands(value: number, bands: [number, number][]): number {
  for (let i = 0; i < bands.length; i++) {
    const [threshold, score] = bands[i];
    if (value < threshold) {
      if (i === 0) return (value / threshold) * score;
      const [pt, ps] = bands[i - 1];
      const ratio = (value - pt) / (threshold - pt);
      return ps + ratio * (score - ps);
    }
  }
  return bands[bands.length - 1][1];
}

function ageYears(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const t = Date.parse(releaseDate);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

interface Evidence {
  exactPhrase: boolean;
  allWords: boolean;
  partialOverlap: number;
  proximity: number;
  evidence: number;
}

/** Match hierarchy: exact phrase > all words > partial overlap. Returns [0,1]. */
function keywordTitleEvidence(keyword: string, title: string): Evidence {
  const kw = (keyword ?? "").toLowerCase().trim();
  const titleLower = (title ?? "").toLowerCase();
  const kwTokens = new Set(tokenize(kw));
  const titleList = tokenize(titleLower);
  const titleTokens = new Set(titleList);

  if (kwTokens.size === 0 || titleTokens.size === 0) {
    return { exactPhrase: false, allWords: false, partialOverlap: 0, proximity: 0, evidence: 0 };
  }

  const exactPhrase = kw.length > 0 && titleLower.includes(kw);
  const allWords = [...kwTokens].every((t) => titleTokens.has(t));
  const overlapCount = [...kwTokens].filter((t) => titleTokens.has(t)).length;
  const overlap = overlapCount / kwTokens.size;

  let proximity = 0;
  if (allWords && kwTokens.size > 1) {
    const positions: number[] = [];
    for (const token of kwTokens) {
      const idx = titleList.indexOf(token);
      if (idx >= 0) positions.push(idx);
    }
    if (positions.length) {
      const span = Math.max(1, Math.max(...positions) - Math.min(...positions) + 1);
      proximity = Math.min(1, kwTokens.size / span);
    }
  }

  let strong = 0;
  if (exactPhrase) strong = 1;
  else if (allWords) strong = 0.85 + 0.15 * proximity;

  let partial = 0;
  if (!exactPhrase && !allWords && overlap > 0) partial = Math.min(0.5, overlap * 0.5);

  return {
    exactPhrase,
    allWords,
    partialOverlap: overlap,
    proximity,
    evidence: Math.max(strong, partial),
  };
}

// ───────────────────────── popularity ─────────────────────────

/** Estimate keyword search popularity (5–100) from competitor data. */
export function estimatePopularity(competitors: Competitor[], keyword: string): number | null {
  if (!competitors.length) return null;
  const n = competitors.length;
  const kw = keyword.toLowerCase().trim();
  const wordCount = kw ? kw.split(/\s+/).length : 1;

  // Signal 1 — result count (0–25)
  let resultScore = Math.min(25, n * 2.5);

  // Signal 2 — leader strength (0–30), top half only
  const topHalf = competitors.slice(0, Math.max(Math.floor(n / 2), 1));
  const maxReviews = Math.max(...topHalf.map((c) => c.userRatingCount || 0));
  let leaderScore: number;
  if (maxReviews <= 0) leaderScore = 0;
  else if (maxReviews >= 1_000_000) leaderScore = 30;
  else
    leaderScore = logBands(maxReviews, [
      [10, 1], [100, 5], [1_000, 10], [10_000, 17], [100_000, 24], [1_000_000, 30],
    ]);

  // Signal 3 — title-match density (0–20) + relevance accumulation
  let titleMatches = 0;
  let exactPhraseMatches = 0;
  let relevanceSum = 0;
  for (const c of competitors) {
    const e = keywordTitleEvidence(kw, c.trackName);
    relevanceSum += e.evidence;
    if (e.exactPhrase) { titleMatches++; exactPhraseMatches++; }
    else if (e.allWords) titleMatches++;
  }
  let titleScore = Math.min(20, (titleMatches / n) * 40);

  // Signal 4 — market depth, median reviews (0–10)
  const med = median(competitors.map((c) => c.userRatingCount || 0));
  let depthScore: number;
  if (med <= 0) depthScore = 0;
  else if (med >= 50_000) depthScore = 10;
  else depthScore = logBands(med, [[10, 0.5], [100, 3], [1_000, 5], [10_000, 8], [50_000, 10]]);

  // Signal 5 — keyword specificity penalty (−5..−30)
  let specificity: number;
  const spPoints: [number, number][] = [[1, 0], [2, -3], [3, -8], [4, -15], [5, -22], [6, -28]];
  if (wordCount <= 1) specificity = 0;
  else if (wordCount >= 6) specificity = -28;
  else {
    specificity = -28;
    for (let i = 0; i < spPoints.length - 1; i++) {
      const [lw, lv] = spPoints[i];
      const [hw, hv] = spPoints[i + 1];
      if (wordCount >= lw && wordCount <= hw) {
        const t = (wordCount - lw) / (hw - lw);
        specificity = lv + t * (hv - lv);
        break;
      }
    }
  }

  // Signal 6 — exact phrase bonus (0–15)
  let exactBonus = Math.min(15, (exactPhraseMatches / n) * 50);

  // Small-sample dampening of ratio-based signals
  const damp = Math.min(1, n / 10);
  titleScore *= damp;
  exactBonus *= damp;

  // Backfill-aware dampening of count-based signals
  const relevanceRatio = relevanceSum / n;
  const relevance = Math.max(0.3, Math.min(1, relevanceRatio * 2.6));
  resultScore *= relevance;
  leaderScore *= relevance;
  depthScore *= relevance;

  const total = Math.round(
    resultScore + leaderScore + titleScore + depthScore + specificity + exactBonus,
  );
  return Math.max(5, Math.min(100, total));
}

/**
 * Weight of the autocomplete (real-search-behavior) signal vs. the competitive
 * estimate when both are available. Both scores are 5–100.
 */
export const SUGGEST_WEIGHT = 0.5;

/**
 * Blend the competitive-inference popularity (from competitor data) with the
 * App Store autocomplete signal (real user search behavior). Either may be null:
 *   - both present → weighted average
 *   - one present  → use it
 *   - neither      → null
 */
export function blendPopularity(competitive: number | null, suggest: number | null): number | null {
  if (competitive != null && suggest != null) {
    return Math.round(competitive * (1 - SUGGEST_WEIGHT) + suggest * SUGGEST_WEIGHT);
  }
  return competitive ?? suggest;
}

// ───────────────────────── difficulty ─────────────────────────

const DIFF_WEIGHTS = {
  ratingVolume: 0.3,
  reviewVelocity: 0.1,
  dominantPlayers: 0.2,
  ratingQuality: 0.1,
  marketAge: 0.1,
  publisherDiversity: 0.1,
  titleRelevance: 0.1,
};

function ratingVolumeScore(medianRatings: number): number {
  if (medianRatings <= 0) return 0;
  if (medianRatings >= 100_000) return 100;
  return logBands(medianRatings, [
    [50, 5], [200, 15], [500, 30], [2_000, 50], [5_000, 65], [10_000, 78], [25_000, 88], [100_000, 95],
  ]);
}

function reviewVelocityScore(competitors: Competitor[]): number {
  const vels: number[] = [];
  for (const c of competitors) {
    const reviews = c.userRatingCount || 0;
    const age = ageYears(c.releaseDate);
    if (age != null && reviews > 0) vels.push(reviews / Math.max(0.5, age));
  }
  if (!vels.length) return 50;
  const m = median(vels);
  if (m <= 0) return 0;
  if (m >= 50_000) return 100;
  return logBands(m, [[10, 5], [50, 15], [200, 30], [1_000, 50], [5_000, 70], [20_000, 85], [50_000, 95]]);
}

function ratingQualityScore(avgQuality: number): number {
  if (avgQuality <= 0) return 0;
  if (avgQuality >= 5) return 100;
  return linearBands(avgQuality, [
    [0, 0], [3, 20], [3.5, 35], [4, 50], [4.3, 70], [4.5, 85], [5, 100],
  ]);
}

function marketAgeScore(competitors: Competitor[]): number {
  const ages: number[] = [];
  for (const c of competitors) {
    const a = ageYears(c.releaseDate);
    if (a != null) ages.push(a);
  }
  if (!ages.length) return 50;
  const avg = ages.reduce((s, a) => s + a, 0) / ages.length;
  if (avg <= 0) return 0;
  if (avg >= 10) return 100;
  return linearBands(avg, [[0.5, 10], [1, 20], [2, 35], [3, 50], [5, 70], [8, 85], [10, 100]]);
}

export interface SubScores {
  ratingVolume: number;
  reviewVelocity: number;
  dominantPlayers: number;
  ratingQuality: number;
  marketAge: number;
  publisherDiversity: number;
  titleRelevance: number;
  titleMatchCount: number;
  medianReviews: number;
  leaderReviews: number;
}

/** Core (pre-override) difficulty + sub-scores. Reused per ranking tier. */
function computeRawDifficulty(competitors: Competitor[], keyword: string): { raw: number; sub: SubScores } {
  const n = competitors.length;
  const empty: SubScores = {
    ratingVolume: 0, reviewVelocity: 0, dominantPlayers: 0, ratingQuality: 0,
    marketAge: 0, publisherDiversity: 0, titleRelevance: 0,
    titleMatchCount: 0, medianReviews: 0, leaderReviews: 0,
  };
  if (n === 0) return { raw: 0, sub: empty };

  const kw = keyword.toLowerCase().trim();
  const ratingCounts = competitors.map((c) => c.userRatingCount || 0);
  const medianReviews = median(ratingCounts);

  const ratingVolume = ratingVolumeScore(medianReviews);
  const reviewVelocity = reviewVelocityScore(competitors);

  // Dominant players — per-app log dominance, top half weighted 2×
  const logCeiling = Math.log10(10_000_000);
  const topHalfSize = Math.max(Math.floor(n / 2), 1);
  let dominanceTotal = 0;
  ratingCounts.forEach((r, i) => {
    if (r > 0) {
      const d = Math.min(1, Math.log10(Math.max(r, 1)) / logCeiling);
      dominanceTotal += d * (i < topHalfSize ? 2 : 1);
    }
  });
  const weightSum = 2 * topHalfSize + Math.max(n - topHalfSize, 0);
  const dominantPlayers = Math.min(100, (dominanceTotal / Math.max(weightSum, 1)) * 100);

  // Rating quality — review-weighted average star rating
  let wSum = 0, wTot = 0;
  for (const c of competitors) {
    const rating = c.averageUserRating || 0;
    const reviews = c.userRatingCount || 0;
    if (rating > 0 && reviews > 0) {
      const w = Math.log1p(reviews);
      wSum += rating * w;
      wTot += w;
    }
  }
  const ratingQuality = ratingQualityScore(wTot > 0 ? wSum / wTot : 0);

  const marketAge = marketAgeScore(competitors);

  // Publisher diversity — unique sellers / n
  const sellers = new Set(
    competitors.map((c) => (c.sellerName || c.artistName || "").toLowerCase().trim()).filter(Boolean),
  );
  const publisherDiversity = Math.min(100, (sellers.size / n) * 100);

  // Title relevance — share of competitors with exact/all-word match
  let titleMatchCount = 0;
  for (const c of competitors) {
    const e = keywordTitleEvidence(kw, c.trackName);
    if (e.exactPhrase || e.allWords) titleMatchCount++;
  }
  const titleRelevance = (titleMatchCount / n) * 100;

  const raw =
    ratingVolume * DIFF_WEIGHTS.ratingVolume +
    reviewVelocity * DIFF_WEIGHTS.reviewVelocity +
    dominantPlayers * DIFF_WEIGHTS.dominantPlayers +
    ratingQuality * DIFF_WEIGHTS.ratingQuality +
    marketAge * DIFF_WEIGHTS.marketAge +
    publisherDiversity * DIFF_WEIGHTS.publisherDiversity +
    titleRelevance * DIFF_WEIGHTS.titleRelevance;

  return {
    raw,
    sub: {
      ratingVolume, reviewVelocity, dominantPlayers, ratingQuality, marketAge,
      publisherDiversity, titleRelevance,
      titleMatchCount, medianReviews, leaderReviews: ratingCounts[0] ?? 0,
    },
  };
}

export interface DifficultyTier {
  score: number;
  label: string;
}

export interface DifficultyResult {
  score: number;
  label: string;
  sub: SubScores;
  tiers: { top5: DifficultyTier; top10: DifficultyTier; top20: DifficultyTier };
}

export function difficultyLabel(score: number): string {
  if (score < 16) return "Very Easy";
  if (score < 36) return "Easy";
  if (score < 56) return "Moderate";
  if (score < 76) return "Hard";
  if (score < 91) return "Very Hard";
  return "Extreme";
}

/** Full difficulty score (1–100) with post-processing caps + ranking tiers. */
export function calcDifficulty(competitors: Competitor[], keyword: string): DifficultyResult {
  const { raw, sub } = computeRawDifficulty(competitors, keyword);
  const n = competitors.length;

  let score = raw;
  // Weak-leader cap — the #1 app's strength is the strongest signal.
  if (sub.leaderReviews < 100) score = Math.min(score, 35);
  else if (sub.leaderReviews < 1_000) score = Math.min(score, 50);
  // Small-result-set cap — little real competition if Apple returns ≤3.
  if (n <= 3) score = Math.min(score, 30);
  // Backfill discount — low title match + weak leader = generic backfill.
  const matchRatio = n > 0 ? sub.titleMatchCount / n : 0;
  if (matchRatio < 0.3 && sub.leaderReviews < 1_000) score *= 0.7;

  score = Math.max(1, Math.min(100, Math.round(score)));

  const tier = (slice: Competitor[]): DifficultyTier => {
    const t = Math.max(1, Math.min(100, Math.round(computeRawDifficulty(slice, keyword).raw)));
    return { score: t, label: difficultyLabel(t) };
  };

  return {
    score,
    label: difficultyLabel(score),
    sub,
    tiers: {
      top5: tier(competitors.slice(0, 5)),
      top10: tier(competitors.slice(0, 10)),
      top20: tier(competitors.slice(0, 20)),
    },
  };
}

// ───────────────────────── downloads ─────────────────────────

const POP_TO_SEARCHES: [number, number][] = [
  [5, 1], [10, 3], [15, 5], [20, 10], [25, 20], [30, 35], [35, 55], [40, 90],
  [45, 140], [50, 200], [55, 290], [60, 400], [65, 550], [70, 750], [75, 1_100],
  [80, 2_000], [85, 4_000], [90, 8_000], [95, 16_000], [100, 32_000],
];
const MAX_SEARCHES = 32_000;

const TTR: Record<number, number> = {
  // Positions 1–20: measured tap-through rates
  1: 0.3, 2: 0.18, 3: 0.12, 4: 0.085, 5: 0.06, 6: 0.045, 7: 0.033, 8: 0.025,
  9: 0.019, 10: 0.013, 11: 0.009, 12: 0.007, 13: 0.0055, 14: 0.0042, 15: 0.0033,
  16: 0.0025, 17: 0.0019, 18: 0.0014, 19: 0.001, 20: 0.0007,
  // Positions 21–50: exponential decay (≈ ×0.82 per step from position 20)
  21: 0.00057, 22: 0.00047, 23: 0.00038, 24: 0.00031, 25: 0.00026,
  26: 0.00021, 27: 0.00017, 28: 0.00014, 29: 0.000115, 30: 0.000094,
  31: 0.000077, 32: 0.000063, 33: 0.000052, 34: 0.000042, 35: 0.000035,
  36: 0.000028, 37: 0.000023, 38: 0.000019, 39: 0.000016, 40: 0.000013,
  41: 0.000011, 42: 0.000009, 43: 0.0000074, 44: 0.0000061, 45: 0.000005,
  46: 0.0000041, 47: 0.0000034, 48: 0.0000028, 49: 0.0000023, 50: 0.0000019,
};
const CVR_LOW = 0.05;
const CVR_HIGH = 0.2;

const MARKET_SIZE: Record<string, number> = {
  us: 1.0, cn: 0.45, jp: 0.35, gb: 0.3, de: 0.25, fr: 0.22, kr: 0.2, br: 0.18,
  in: 0.15, ca: 0.15, au: 0.12, ru: 0.12, it: 0.12, es: 0.1, mx: 0.1, tw: 0.08,
  nl: 0.07, se: 0.06, ch: 0.06, pl: 0.05, tr: 0.05, th: 0.05, id: 0.05, be: 0.04,
  at: 0.04, no: 0.04, dk: 0.04, sg: 0.04, il: 0.04, ae: 0.04, sa: 0.04, ph: 0.04,
  my: 0.04, za: 0.03, ie: 0.03, fi: 0.03, pt: 0.03, nz: 0.03, cl: 0.03, ar: 0.03,
  co: 0.03, ng: 0.03, eg: 0.03, pk: 0.02, ke: 0.02, gh: 0.02, tz: 0.02, ug: 0.02,
};
const MARKET_SIZE_DEFAULT = 0.03;

function dailySearches(popularity: number): number {
  if (!popularity || popularity <= 0) return 0;
  const pts = POP_TO_SEARCHES;
  if (popularity <= pts[0][0]) return pts[0][1] * (popularity / pts[0][0]);
  if (popularity >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    const [p0, s0] = pts[i - 1];
    const [p1, s1] = pts[i];
    if (popularity <= p1) return s0 + ((popularity - p0) / (p1 - p0)) * (s1 - s0);
  }
  return pts[pts.length - 1][1];
}

export interface PositionEstimate {
  pos: number;
  ttr: number;
  downloadsLow: number;
  downloadsHigh: number;
}

export interface DownloadEstimate {
  dailySearches: number;
  positions: PositionEstimate[];
}

export function estimateDownloads(popularity: number, country = "us"): DownloadEstimate {
  const searches = dailySearches(popularity) * (MARKET_SIZE[country.toLowerCase()] ?? MARKET_SIZE_DEFAULT);
  const positions: PositionEstimate[] = [];
  for (let pos = 1; pos <= 50; pos++) {
    const ttr = TTR[pos] ?? 0.001;
    positions.push({
      pos,
      ttr: Math.round(ttr * 100 * 100) / 100,
      downloadsLow: Math.round(searches * ttr * CVR_LOW * 100) / 100,
      downloadsHigh: Math.round(searches * ttr * CVR_HIGH * 100) / 100,
    });
  }
  return { dailySearches: Math.round(searches * 100) / 100, positions };
}

// ───────────────────────── opportunity / classification ─────────────────────────

/** Opportunity (0–100): log-normalized volume gated quadratically by difficulty. */
export function calcOpportunity(popularity: number, difficulty: number): number {
  if (!popularity || popularity <= 0) return 0;
  const searches = dailySearches(popularity);
  if (searches <= 0) return 0;
  const volume = Math.log10(1 + searches) / Math.log10(1 + MAX_SEARCHES);
  const gate = 1 - (difficulty / 100) ** 2;
  return Math.max(0, Math.min(100, Math.floor(volume * gate * 100)));
}

export type Classification =
  | "Sweet Spot" | "Good Target" | "Hidden Gem" | "High Competition"
  | "Moderate" | "Low Volume" | "Avoid";

export function classifyKeyword(popularity: number, difficulty: number): Classification {
  const opp = calcOpportunity(popularity, difficulty);
  if (popularity >= 40 && difficulty <= 40) return "Sweet Spot";
  if (popularity >= 25 && popularity < 40 && difficulty <= 30 && opp >= 30) return "Hidden Gem";
  if (popularity < 15) return "Low Volume";
  if (difficulty >= 65) return "High Competition";
  if (opp >= 55) return "Good Target";
  if (opp <= 25) return "Avoid";
  return "Moderate";
}

export interface Targeting {
  icon: string;
  label: Classification;
  description: string;
}

const TARGETING: Record<Classification, Targeting> = {
  "Sweet Spot": { icon: "🎯", label: "Sweet Spot", description: "High search volume + low competition — the ideal ASO target." },
  "Good Target": { icon: "✅", label: "Good Target", description: "Solid search volume with manageable competition." },
  "Hidden Gem": { icon: "💎", label: "Hidden Gem", description: "Moderate volume with minimal competition — an overlooked opportunity." },
  "High Competition": { icon: "⚔️", label: "High Competition", description: "Dominated by established apps. Focus on long-tail variants instead." },
  "Moderate": { icon: "👍", label: "Moderate", description: "Reasonable opportunity. Works as a supporting keyword." },
  "Low Volume": { icon: "🔍", label: "Low Volume", description: "Very few searches. Only worth it if highly relevant to your app." },
  "Avoid": { icon: "🚫", label: "Avoid", description: "Low opportunity. Effort better spent elsewhere." },
};

export function getTargeting(popularity: number, difficulty: number): Targeting {
  return TARGETING[classifyKeyword(popularity, difficulty)];
}

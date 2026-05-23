/**
 * App Store search-suggestion ("hints") client — a real user-search-behavior
 * popularity signal to complement the competitive-inference score in scoring.ts.
 *
 * Apple's autocomplete endpoint returns the most-searched query completions for
 * a typed prefix, in popularity-ranked order:
 *
 *   https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints
 *     ?clientApplication=Software&term=<prefix>
 *
 * Two quirks (verified live):
 *   1. It returns a **plist (XML)** body, not JSON — we extract the ordered
 *      <key>term</key><string>…</string> values with a targeted regex.
 *   2. It returns EMPTY unless the `X-Apple-Store-Front` header is set to the
 *      country's storefront id.
 *
 * The "character-budget" idea: the fewer characters a user must type before a
 * keyword surfaces in autocomplete (and the higher it ranks), the more popular
 * the keyword is. Popular terms appear with a short prefix; long-tail terms only
 * appear once you've typed almost the whole phrase.
 */

// Apple storefront ids for the countries Peek supports (see lib/format.ts).
// The trailing ",29" is the platform/api version segment.
const STOREFRONTS: Record<string, string> = {
  us: "143441",
  gb: "143444",
  ca: "143455",
  au: "143460",
  in: "143467",
  de: "143443",
  fr: "143442",
  es: "143454",
  it: "143450",
  br: "143503",
  mx: "143468",
  jp: "143462",
  kr: "143466",
};

// Match the 30-min iTunes cache window so repeated keyword lookups are cheap.
const CACHE_SECONDS = 60 * 30;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * Normalize a term for comparison: lowercase, strip apostrophes (straight ',
 * curly ' U+2019, ʼ U+02BC) and collapse whitespace. This lets the user's
 * "mens health" match Apple's autocompleted "men's health".
 */
function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/[’'ʼ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fetch ordered autocomplete suggestions for a typed prefix.
 * Returns lowercased terms in Apple's popularity rank order, or [] on any error.
 */
export async function fetchHints(prefix: string, country = "us"): Promise<string[]> {
  const storefront = STOREFRONTS[country.toLowerCase()] ?? STOREFRONTS.us;
  const url =
    "https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?" +
    new URLSearchParams({ clientApplication: "Software", term: prefix }).toString();

  let body: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PeekWeb/0.1 (+aso research)",
        "X-Apple-Store-Front": `${storefront},29`,
      },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return [];
    body = await res.text();
  } catch {
    return [];
  }

  // Each hint dict is <key>term</key><string>TERM</string><key>url</key>… —
  // this regex targets only the term values, so URLs and the list title are skipped.
  const terms: string[] = [];
  const re = /<key>term<\/key>\s*<string>(.*?)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    terms.push(decodeXml(m[1]).toLowerCase().trim());
  }
  return terms;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Popularity signal (5–100) for a keyword, derived from how few characters are
 * needed to surface it in autocomplete and how highly it ranks. Returns null
 * when the term never surfaces (no usable signal — caller should fall back to
 * the competitive estimate rather than treat this as "unpopular").
 *
 * Bounded to ≤4 hint requests per keyword (early-stops as soon as the term
 * surfaces); each request is cached for 30 min.
 */
export async function suggestPopularity(keyword: string, country = "us"): Promise<number | null> {
  const kw = normalizeTerm(keyword);
  const L = kw.length;
  if (L < 2) return null;

  // Probe progressively longer prefixes; the shortest one that surfaces the term
  // is its "character budget". Capped at 4 distinct lengths to bound API cost.
  const candidates = [3, Math.ceil(L * 0.5), Math.ceil(L * 0.75), L]
    .map((n) => Math.max(2, Math.min(L, n)))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  let stemFoundAtFull = false;
  for (const plen of candidates) {
    const rawHints = await fetchHints(kw.slice(0, plen), country);
    if (rawHints.length === 0) continue;
    // Normalize hints (apostrophe-insensitive) before matching.
    const hints = rawHints.map(normalizeTerm);

    const rank = hints.indexOf(kw); // exact-term match, 0-based
    if (rank !== -1) {
      // earliness: surfaced near the start of typing = very popular (→1),
      // only at the full phrase = long-tail (→0).
      const earliness = L > 2 ? clamp01((L - plen) / (L - 2)) : 1;
      const rankBonus = clamp01(1 - rank / 10); // rank 1 → 1.0, rank 11 → 0
      const raw = 100 * (0.35 + 0.5 * earliness + 0.15 * rankBonus);
      return Math.round(Math.max(35, Math.min(100, raw)));
    }
    // At the full-length probe, note if Apple completes the stem to longer phrases.
    if (plen === L && hints.some((h) => h.startsWith(kw + " "))) {
      stemFoundAtFull = true;
    }
  }

  // Known stem but Apple only suggests longer variants → genuine long-tail term.
  return stemFoundAtFull ? 25 : null;
}

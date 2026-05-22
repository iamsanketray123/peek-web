/**
 * Ad-library deep links.
 *
 * There is NO free, cross-network API for a given app's live ad creatives:
 *   - Meta's Ad Library API is OAuth-token-gated and, outside the EU, only
 *     returns ads about social issues / elections / politics.
 *   - TikTok's Commercial Content Library API is EU-only and access-gated.
 *   - Google's Ads Transparency Center has no public API.
 *
 * The honest, free alternative is to deep-link into each network's *public*
 * ad library, pre-filtered by the advertiser/app name, so the user can browse
 * the live creatives in one click. These are link-outs, not in-app data.
 */

export type AdNetwork = "meta" | "tiktok" | "google";

export interface AdLibraryLink {
  network: AdNetwork;
  label: string;
  /** Networks/surfaces the library covers. */
  surfaces: string;
  url: string;
  /** Honest caveat about coverage shown in the UI. */
  note: string;
}

/**
 * Build deep links into the public ad libraries for an advertiser.
 * @param appName    The app/brand name (primary search term).
 * @param developer  The developer/seller name (Meta pages often use this).
 * @param country    Storefront country code (used to scope where relevant).
 */
export function adLibraryLinks(
  appName: string,
  developer?: string,
  country = "us",
): AdLibraryLink[] {
  // Brand name is the better creative-search term; fall back to developer.
  const brand = (appName || developer || "").trim();
  const q = encodeURIComponent(brand);
  const region = country.toUpperCase();

  return [
    {
      network: "meta",
      label: "Meta Ad Library",
      surfaces: "Facebook · Instagram",
      url:
        "https://www.facebook.com/ads/library/?" +
        `active_status=active&ad_type=all&country=ALL&media_type=all` +
        `&q=${q}&search_type=keyword_unordered`,
      note: "All live Facebook & Instagram ads worldwide. Most reliable source.",
    },
    {
      network: "tiktok",
      label: "TikTok Ad Library",
      surfaces: "TikTok",
      url: `https://library.tiktok.com/ads?region=${region}&query=${q}`,
      note: "Commercial Content Library — strongest coverage in the EU/EEA & UK.",
    },
    {
      network: "google",
      label: "Google Ads Transparency",
      surfaces: "Search · YouTube · Display",
      url: `https://adstransparency.google.com/?region=anywhere&query=${q}`,
      note: "Search, YouTube & Display ads run by the advertiser.",
    },
  ];
}

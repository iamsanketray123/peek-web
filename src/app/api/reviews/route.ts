import { NextResponse } from "next/server";
import { extractAppleId, lookupApp, ITunesError } from "@/lib/aso/itunes";
import {
  fetchReviews,
  summarize,
  type ReviewedApp,
  type Review,
  type ReviewSummary,
} from "@/lib/aso/reviews";
import { adLibraryLinks, type AdLibraryLink } from "@/lib/aso/ads";

export const runtime = "nodejs";

export interface ReviewsResult {
  app: ReviewedApp;
  reviews: Review[];
  summary: ReviewSummary;
  ads: AdLibraryLink[];
}

export async function POST(req: Request) {
  let body: { input?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = (body.input ?? "").trim();
  const country = (body.country ?? "us").trim().toLowerCase();

  if (!input) {
    return NextResponse.json({ error: "An App Store URL or ID is required." }, { status: 400 });
  }

  const appleId = extractAppleId(input);
  if (!appleId) {
    return NextResponse.json(
      { error: "Couldn't find an App Store ID. Paste an app link or numeric ID." },
      { status: 400 },
    );
  }

  try {
    const [app, reviews] = await Promise.all([
      lookupApp(appleId, country),
      fetchReviews(appleId, country),
    ]);

    if (!app) {
      return NextResponse.json(
        { error: `No app found for ID ${appleId} in the ${country.toUpperCase()} store.` },
        { status: 404 },
      );
    }

    const reviewedApp: ReviewedApp = {
      appleId,
      name: app.trackName,
      developer: app.sellerName || app.artistName,
      icon: app.artworkUrl512 ?? app.artworkUrl100 ?? null,
      avgRating: app.averageUserRating,
      ratingCount: app.userRatingCount,
      genre: app.primaryGenreName ?? null,
      url: app.trackViewUrl ?? null,
      country,
    };

    const result: ReviewsResult = {
      app: reviewedApp,
      reviews,
      summary: summarize(reviews),
      ads: adLibraryLinks(reviewedApp.name, reviewedApp.developer, country),
    };
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ITunesError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("reviews error", e);
    return NextResponse.json({ error: "Failed to load reviews." }, { status: 500 });
  }
}

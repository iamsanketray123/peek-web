import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findAppRank } from "@/lib/aso/rank";

// Daily snapshot job (Vercel Cron). Two tasks:
// 1. For every tracked app-keyword, look up the app's current rank and append a RankSnapshot.
// 2. For every saved keyword (Keyword Explorer), snapshot its current metrics for trend data.
//
// Protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <secret>`
// automatically when the env var is set. Manual calls must include it too.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds (Vercel function cap)

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── 1. App keyword rank snapshots ──
  const keywords = await prisma.appKeyword.findMany({
    include: { app: { select: { appleId: true, country: true } } },
  });

  let recorded = 0;
  let failed = 0;

  // Sequential to stay gentle on Apple's API (it throttles aggressively).
  for (const kw of keywords) {
    try {
      const position = await findAppRank(kw.app.appleId, kw.term, kw.app.country);
      await prisma.rankSnapshot.create({ data: { appKeywordId: kw.id, position } });
      recorded++;
    } catch {
      failed++;
    }
  }

  // ── 2. Saved keyword metric snapshots (for Keyword Explorer trend charts) ──
  // Snapshot each saved keyword's current stored metrics once per day.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const savedKeywords = await prisma.savedKeyword.findMany({
    select: { id: true, popularity: true, difficulty: true, opportunity: true },
  });

  let kwRecorded = 0;
  for (const sk of savedKeywords) {
    // Only create one snapshot per keyword per day
    const exists = await prisma.keywordMetricSnapshot.findFirst({
      where: {
        savedKeywordId: sk.id,
        capturedAt: { gte: todayStart, lt: todayEnd },
      },
      select: { id: true },
    });
    if (!exists) {
      await prisma.keywordMetricSnapshot.create({
        data: {
          savedKeywordId: sk.id,
          popularity: sk.popularity,
          difficulty: sk.difficulty,
          opportunity: sk.opportunity,
        },
      });
      kwRecorded++;
    }
  }

  return NextResponse.json({
    ok: true,
    keywords: keywords.length,
    recorded,
    failed,
    savedKeywordsSnapshotted: kwRecorded,
    at: new Date().toISOString(),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findAppRank } from "@/lib/aso/rank";

// Daily rank snapshot job (Vercel Cron). For every tracked app-keyword, look up
// the app's current rank and append a RankSnapshot, building position history.
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

  return NextResponse.json({
    ok: true,
    keywords: keywords.length,
    recorded,
    failed,
    at: new Date().toISOString(),
  });
}

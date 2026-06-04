"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";

export interface SavedKeywordDTO {
  id: string;
  term: string;
  country: string;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
  classification: string | null;
  createdAt: string;
  hasSnapshots: boolean;
}

export interface TrendPointDTO {
  date: string; // ISO date string (YYYY-MM-DD)
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
}

interface SaveInput {
  term: string;
  country: string;
  popularity?: number | null;
  difficulty?: number | null;
  opportunity?: number | null;
  classification?: string | null;
}

function toDTO(k: {
  id: string;
  term: string;
  country: string;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
  classification: string | null;
  createdAt: Date;
  _count?: { metricSnapshots: number };
}): SavedKeywordDTO {
  return {
    id: k.id,
    term: k.term,
    country: k.country,
    popularity: k.popularity,
    difficulty: k.difficulty,
    opportunity: k.opportunity,
    classification: k.classification,
    createdAt: k.createdAt.toISOString(),
    hasSnapshots: (k._count?.metricSnapshots ?? 0) > 0,
  };
}

/** Save (or update) a keyword for the signed-in user. Also upserts today's metric snapshot. */
export async function saveKeyword(input: SaveInput): Promise<SavedKeywordDTO> {
  const user = await getUser();
  if (!user) throw new Error("You must be signed in to save keywords.");

  const term = input.term.trim().toLowerCase();
  const country = (input.country || "us").toLowerCase();
  if (!term) throw new Error("Keyword is required.");

  const data = {
    popularity: input.popularity ?? null,
    difficulty: input.difficulty ?? null,
    opportunity: input.opportunity ?? null,
    classification: input.classification ?? null,
  };

  const rec = await prisma.savedKeyword.upsert({
    where: { userId_term_country: { userId: user.id, term, country } },
    create: { userId: user.id, term, country, ...data },
    update: data,
    include: { _count: { select: { metricSnapshots: true } } },
  });

  // Auto-upsert today's metric snapshot so trends start populating immediately.
  // Only create one snapshot per keyword per calendar day (UTC).
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const existingToday = await prisma.keywordMetricSnapshot.findFirst({
    where: {
      savedKeywordId: rec.id,
      capturedAt: { gte: todayStart, lt: todayEnd },
    },
  });

  if (existingToday) {
    // Update today's snapshot with the latest values
    await prisma.keywordMetricSnapshot.update({
      where: { id: existingToday.id },
      data: {
        popularity: data.popularity,
        difficulty: data.difficulty,
        opportunity: data.opportunity,
      },
    });
  } else {
    await prisma.keywordMetricSnapshot.create({
      data: {
        savedKeywordId: rec.id,
        popularity: data.popularity,
        difficulty: data.difficulty,
        opportunity: data.opportunity,
      },
    });
  }

  revalidatePath("/");
  return toDTO(rec);
}

/** Remove a saved keyword (must belong to the signed-in user). */
export async function removeSavedKeyword(id: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("You must be signed in.");

  // deleteMany with userId guard ensures users can only delete their own rows.
  await prisma.savedKeyword.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/");
}

/** List the signed-in user's saved keywords (newest first). */
export async function listSavedKeywords(): Promise<SavedKeywordDTO[]> {
  const user = await getUser();
  if (!user) return [];

  const rows = await prisma.savedKeyword.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { metricSnapshots: true } } },
  });
  return rows.map(toDTO);
}

/** Fetch the last 30 metric snapshots for a saved keyword (for the trend chart). */
export async function getKeywordTrend(savedKeywordId: string): Promise<TrendPointDTO[]> {
  const user = await getUser();
  if (!user) throw new Error("You must be signed in.");

  // Verify the keyword belongs to this user
  const kw = await prisma.savedKeyword.findFirst({
    where: { id: savedKeywordId, userId: user.id },
    select: { id: true },
  });
  if (!kw) throw new Error("Keyword not found.");

  const snapshots = await prisma.keywordMetricSnapshot.findMany({
    where: { savedKeywordId },
    orderBy: { capturedAt: "asc" },
    take: 30,
  });

  return snapshots.map((s) => ({
    date: s.capturedAt.toISOString().slice(0, 10),
    popularity: s.popularity,
    difficulty: s.difficulty,
    opportunity: s.opportunity,
  }));
}

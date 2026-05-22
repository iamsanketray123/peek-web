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
  };
}

/** Save (or update) a keyword for the signed-in user. */
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
  });

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
  });
  return rows.map(toDTO);
}

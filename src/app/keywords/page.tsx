import { redirect } from "next/navigation";
import KeywordExplorer from "@/components/KeywordExplorer";
import { getUser } from "@/lib/supabase/server";
import { listSavedKeywords } from "@/app/actions/keywords";

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // Supabase email-confirm links — forward to auth callback.
  if (params.code) {
    const code = Array.isArray(params.code) ? params.code[0] : params.code;
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  const user = await getUser();
  const saved = user ? await listSavedKeywords() : [];

  return <KeywordExplorer isAuthed={!!user} initialSaved={saved} />;
}

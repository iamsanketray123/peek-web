import KeywordExplorer from "@/components/KeywordExplorer";
import { getUser } from "@/lib/supabase/server";
import { listSavedKeywords } from "@/app/actions/keywords";

export default async function Home() {
  const user = await getUser();
  const saved = user ? await listSavedKeywords() : [];

  return <KeywordExplorer isAuthed={!!user} initialSaved={saved} />;
}

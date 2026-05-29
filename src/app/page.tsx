import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // Supabase email-confirm links land here when Site URL is set to the root.
  // Forward the code to the proper auth callback handler.
  if (params.code) {
    const code = Array.isArray(params.code) ? params.code[0] : params.code;
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  redirect("/apps");
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getTrackedApp } from "@/app/actions/apps";
import AppDetail from "@/components/AppDetail";

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted">Sign in to view this app.</p>
        <Link href="/login" className="mt-4 text-sm font-medium text-lime hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  const data = await getTrackedApp(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/apps"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-white"
      >
        <ArrowLeft size={15} /> All apps
      </Link>
      <AppDetail app={data.app} initialKeywords={data.keywords} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTrackedApp } from "@/app/actions/apps";
import AppDetail from "@/components/AppDetail";

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTrackedApp(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 animate-slide-up">
      <Link
        href="/apps"
        className="mb-6 inline-flex lg:hidden items-center gap-2 text-sm text-muted hover:text-white transition-colors duration-150 active:scale-[0.98]"
      >
        <ArrowLeft size={15} /> Back to all apps
      </Link>
      <div className="mb-5 flex justify-end">
        <Link
          href={`/experiments?app=${encodeURIComponent(data.app.id)}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2 text-sm text-lime transition-colors hover:border-lime/40 focus-visible:outline-2 focus-visible:outline-lime"
        >
          Keyword experiments →
        </Link>
      </div>
      <AppDetail key={data.app.id} app={data.app} initialKeywords={data.keywords} />
    </div>
  );
}

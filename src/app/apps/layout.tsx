import { getUser } from "@/lib/supabase/server";
import { listTrackedApps } from "@/app/actions/apps";
import AppsLayoutClient from "@/components/AppsLayoutClient";
import Link from "next/link";

export default async function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    return (
      <div className="flex min-h-[75vh] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">App Tracking</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Sign in to track your apps and watch their keyword rankings change over time.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-xl bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-lime-dim active:scale-[0.98] cursor-pointer shadow-[0_0_15px_rgba(198,244,50,0.1)]"
        >
          Log in
        </Link>
      </div>
    );
  }

  const apps = await listTrackedApps();
  return <AppsLayoutClient initialApps={apps}>{children}</AppsLayoutClient>;
}

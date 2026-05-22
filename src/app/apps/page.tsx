import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { listTrackedApps } from "@/app/actions/apps";
import AppsManager from "@/components/AppsManager";

export const metadata = {
  title: "App Tracking — Peek",
};

export default async function AppsPage() {
  const user = await getUser();

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">App Tracking</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Sign in to track your apps and watch their keyword rankings change over time.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-xl bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-lime-dim"
        >
          Log in
        </Link>
      </div>
    );
  }

  const apps = await listTrackedApps();
  return <AppsManager initialApps={apps} />;
}

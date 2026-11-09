import Link from "next/link";
import { FlaskConical, ArrowUpRight } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { listTrackedApps } from "@/app/actions/apps";
import { getExperimentWorkspace } from "@/app/actions/experiments";
import ExperimentsDashboard from "@/components/ExperimentsDashboard";

export const metadata = { title: "Keyword Experiments — Peek" };
export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const user = await getUser();
  if (!user)
    return (
      <Empty
        title="A notebook for sustainable discovery."
        description="Sign in to track metadata experiments, promotion windows and keyword trends—without mistaking a social spike for lasting growth."
        login
      />
    );
  const apps = await listTrackedApps();
  if (!apps.length)
    return (
      <Empty
        title="Start with an app to experiment on."
        description="Add Medo, Tether or another app in App Tracking, then select the keywords you want to test."
      />
    );
  const { app } = await searchParams;
  const selected = apps.find((a) => a.id === app) ?? apps[0];
  const data = await getExperimentWorkspace(selected.id);
  return <ExperimentsDashboard key={selected.id} data={data} apps={apps} />;
}
function Empty({
  title,
  description,
  login = false,
}: {
  title: string;
  description: string;
  login?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[75vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <FlaskConical size={34} className="mb-5 text-lime" />
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={login ? "/login" : "/apps"}
          className="rounded-xl bg-lime px-5 py-3 text-sm font-semibold text-ink"
        >
          {login ? "Sign in to start" : "Track an app"}
        </Link>
        <Link
          href="/experiments/demo"
          className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm"
        >
          Explore the demo <ArrowUpRight size={15} />
        </Link>
      </div>
    </div>
  );
}

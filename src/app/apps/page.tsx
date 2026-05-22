import { listTrackedApps } from "@/app/actions/apps";
import AppsManager from "@/components/AppsManager";

export const metadata = {
  title: "App Tracking — Peek",
};

export default async function AppsPage() {
  const apps = await listTrackedApps();
  return <AppsManager initialApps={apps} />;
}

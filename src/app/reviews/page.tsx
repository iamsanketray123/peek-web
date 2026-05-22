import ReviewsExplorer from "@/components/ReviewsExplorer";
import { listTrackedApps } from "@/app/actions/apps";

export default async function ReviewsPage() {
  const trackedApps = await listTrackedApps();
  return <ReviewsExplorer initialTrackedApps={trackedApps} />;
}

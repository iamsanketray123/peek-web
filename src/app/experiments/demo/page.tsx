import ExperimentsDashboard from "@/components/ExperimentsDashboard";
import { experimentDemo } from "@/lib/experiments-demo";
export const metadata = { title: "Experiments Demo — Peek" };
export const dynamic = "force-dynamic";
export default function DemoPage() {
  const data = experimentDemo();
  return <ExperimentsDashboard demo data={data} apps={[data.app]} />;
}

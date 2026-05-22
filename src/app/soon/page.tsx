import Link from "next/link";
import { Construction, ArrowLeft } from "lucide-react";

export default function ComingSoon() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Construction size={36} className="mb-4 text-lime" />
      <h1 className="text-xl font-semibold">Coming soon</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        This part of Peek isn&apos;t built yet. The Keyword Explorer is live — start there.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm hover:bg-surface-2"
      >
        <ArrowLeft size={15} /> Back to Keyword Explorer
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {done ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-lime/10 text-lime">
              <CheckCircle size={32} />
              <div className="absolute inset-0 rounded-full border border-lime/30 animate-pulse" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Password updated</h2>
            <p className="mt-2 text-sm text-muted">Redirecting you to the app…</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-ink shadow-[0_0_15px_rgba(198,244,50,0.2)]">
                <Search size={18} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-semibold tracking-tight">peek</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-white">Set new password</h1>
            <p className="mt-1 mb-6 text-sm text-muted">Choose a strong password for your account.</p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <input
                type="password"
                required
                minLength={6}
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 disabled:opacity-50"
              />
              <input
                type="password"
                required
                minLength={6}
                disabled={loading}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Update password
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

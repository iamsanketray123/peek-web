"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Loader2, ArrowLeft, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {sent ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-lime/10 text-lime">
              <Mail size={28} />
              <div className="absolute inset-0 rounded-full border border-lime/30 animate-pulse" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Check your email</h2>
            <p className="mt-2 text-sm text-muted">
              We sent a password reset link to{" "}
              <span className="text-white font-medium">{email}</span>. Click the
              link in the email to reset your password.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-2 text-sm text-lime hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <Link
              href="/login"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-white transition-colors duration-150"
            >
              <ArrowLeft size={15} /> Back to sign in
            </Link>

            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-ink shadow-[0_0_15px_rgba(198,244,50,0.2)]">
                <Search size={18} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-semibold tracking-tight">peek</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-white">Forgot password?</h1>
            <p className="mt-1 mb-6 text-sm text-muted">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Send reset link
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

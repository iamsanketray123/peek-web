"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        // If email confirmation is required, no session is returned yet.
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
          setLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      
      // Successfully authenticated, now entering Next.js page transition phase
      setIsRedirecting(true);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {isRedirecting ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.3)] transition-all">
            <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-lime/10 text-lime">
              <Loader2 size={32} className="animate-spin text-lime" />
              <div className="absolute inset-0 rounded-full border border-lime/30 animate-pulse" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              {mode === "signin" ? "Signing you in" : "Creating account"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Setting up your ASO keyword space. One moment...
            </p>
          </div>
        ) : (
          <>
            <Link 
              href="/" 
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-white transition-colors duration-150"
            >
              <ArrowLeft size={15} /> Back
            </Link>

            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-ink shadow-[0_0_15px_rgba(198,244,50,0.2)]">
                <Search size={18} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-semibold tracking-tight">peek</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 mb-6 text-sm text-muted">
              {mode === "signin"
                ? "Sign in to save and track your keywords."
                : "Sign up to start tracking keywords for your apps."}
            </p>

            {notice && (
              <div className="mb-4 rounded-lg border border-lime/30 bg-lime/10 px-3 py-2 text-sm text-lime transition-all">
                {notice}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition-all">
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
              <input
                type="password"
                required
                minLength={6}
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-lime/80 focus:ring-2 focus:ring-lime/10 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-lime-dim active:scale-[0.98] hover:shadow-[0_0_20px_rgba(198,244,50,0.15)] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === "signin" ? "Sign in" : "Sign up"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-muted">
              {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                disabled={loading}
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
                className="font-medium text-lime hover:underline disabled:opacity-50 cursor-pointer"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

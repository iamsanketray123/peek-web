"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Database,
  TrendingUp,
  Sparkles,
  LineChart,
  Star,
  Settings,
  Smartphone,
  LogOut,
  LogIn,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  ready?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Explore",
    items: [
      { label: "Database", href: "/soon", icon: Database },
      { label: "Trending", href: "/soon", icon: TrendingUp },
      { label: "Rising", href: "/soon", icon: Sparkles },
    ],
  },
  {
    title: "ASO",
    items: [
      { label: "Keyword Explorer", href: "/", icon: Search, ready: true },
      { label: "App Tracking", href: "/apps", icon: Smartphone, ready: true },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reviews", href: "/reviews", icon: Star, ready: true },
      { label: "Insights", href: "/soon", icon: LineChart },
    ],
  },
];

export default function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-ink">
          <Search size={18} strokeWidth={2.5} />
        </div>
        <span className="text-lg font-semibold tracking-tight">peek</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.ready &&
                  (item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={[
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-100 active:scale-[0.98] cursor-pointer",
                        active
                          ? "bg-lime/10 font-medium text-lime"
                          : "text-muted hover:bg-surface-2 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon size={17} />
                      <span className="flex-1">{item.label}</span>
                      {!item.ready && (
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-faint">
                          soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line p-3">
        <Link
          href="/soon"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-white active:scale-[0.98] transition-all duration-100 cursor-pointer"
        >
          <Settings size={17} />
          Settings
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-surface-2/30 border border-line/30">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium uppercase border border-line">
              {userEmail[0]}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-muted font-medium" title={userEmail}>
              {userEmail}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-surface-3 hover:text-red-400 active:scale-90 transition-all duration-150 cursor-pointer"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-white active:scale-[0.98] transition-all duration-100 cursor-pointer"
          >
            <LogIn size={17} />
            Log in
          </Link>
        )}
      </div>
    </aside>
  );
}

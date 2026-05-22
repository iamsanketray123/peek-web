# Peek Web — ASO Tool Build Plan

> Goal: A web-based App Store Optimization (ASO) tool, deployed on Vercel, matching the
> main functionality of **appkittie** (and ideally better). Reference screenshots and
> a working open-source reference (`respectaso`) are available.

**Status:** Phase 0 done. Phase 1 (Keyword Explorer) working end-to-end locally.
**Last updated:** 2026-05-22

---

## 0. Decisions (locked in)

| Decision | Choice | Notes |
|----------|--------|-------|
| **Project location** | New sibling folder `~/Documents/peek-web` | Own git repo, separate from the Swift `Peek` app. |
| **Architecture** | Full backend + accounts | Next.js + Postgres + auth + daily cron. Needed for App Tracking position history over time. |
| **First feature (MVP)** | Keyword Explorer | Search keyword → popularity, difficulty, opportunity, competitor apps. Ports the scoring engine (most reusable piece). |
| **Data source** | Free iTunes Search API only | Port `respectaso` scoring. No API keys, no Apple credentials, no cost. Numbers are *estimates*. |
| **Deploy target** | Vercel | Next.js App Router is the natural fit. |

### Still-open sub-decisions (resolve in Phase 0)
- [ ] **ORM:** Prisma (familiar, great DX) vs Drizzle (lightweight, edge-friendly). *Leaning Prisma.*
- [ ] **DB + Auth provider:** Supabase (Postgres + Auth bundled) vs Neon (Postgres) + NextAuth/Clerk. *Leaning Supabase — fewer moving parts, Vercel-friendly.*
- [ ] **Component lib:** shadcn/ui + Tailwind (recommended for the dark/lime appkittie look).

---

## 1. Reference material

### appkittie (the product we're matching — from screenshots)
Sidebar / feature map:
- **Explore:** Database, Highlights, Trending, Rising
- **Your Apps:** Favorites
- **ASO:** App Tracking, Keyword Explorer, Screenshots, Translations
- **Analytics:** Reviews
- **App Ideas:** Hot ideas
- **API:** API Keys, MCP
- **Settings**

Key screens observed:
- **Keyword Explorer:** Tracked Keywords list (with popularity + app count), a "check difficulty" input, and a "Similar Keywords" panel showing related keywords with Popularity, Difficulty, ranking Apps thumbnails, and a "Similar" action. Plus an "Apps ranking for '<keyword>'" modal listing the top ~10 apps with downloads, revenue, rating, and release date.
- **App Tracking:** "Your Apps" list (keyword count + last-updated), per-app Keywords tab with columns: Position (+ delta), Popularity, Difficulty, Apps thumbnails, Growth sparkline. Plus a Position History tab.
- Visual style: near-black background, **lime-green (#C6F432-ish) accent**, rounded cards, subtle gradients, monospace-ish numerics, inline mini bar charts for popularity/difficulty.

### respectaso (open-source reference — `~/Documents/respectaso`, Django/Python)
The **scoring engine is the gold** and is directly portable. All derived from the free iTunes Search API.
- `aso/scoring.py` — `calc_opportunity()`, `classify_keyword()`, `get_targeting_advice()`, popularity→searches table. **Read in full; small & clean.**
- `aso/services.py` (~2500 lines) — the real algorithms:
  - `PopularityEstimator.estimate()` (line ~264) — 6 signals: result count, leader strength (log-banded review counts), title-match density, market depth (median reviews), keyword specificity penalty, exact-phrase bonus. Output 5–100.
  - `DifficultyCalculator` (line ~1224) — sub-scores: rating volume, review velocity, rating quality, market age; plus `_compute_ranking_tiers()` for Top 5 / Top 10 / Top 20 breakdown. Output 1–100 with tiers.
  - `DownloadEstimator` (line ~984) — popularity → daily searches → downloads-per-position (conservative–optimistic ranges).
  - `ITunesSearchService` (line ~475) — search/lookup + `find_app_rank()` / `_find_rank_in_ssr()` for finding an app's position for a keyword.
- `aso/models.py` — data model reference.

### Peek (Swift app — `~/Documents/Peek`, partial)
Useful as a data-model + API reference, not the build target:
- `Models/`: `Keyword`, `TrackedApp`, `RankSnapshot` (SwiftData).
- `Services/`: `ITunesSearchService` (lookup/search + App Store ID extraction), `AppStoreRankService`, `AppleSearchAdsService`.

---

## 2. Target tech stack

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (dark theme, lime accent)
- **Charts:** Recharts (or visx) for sparklines & position history
- **DB:** Postgres (Supabase or Neon)
- **ORM:** Prisma (or Drizzle)
- **Auth:** Supabase Auth (or NextAuth/Clerk)
- **Background jobs:** Vercel Cron → API route for daily rank/metric snapshots
- **Data source:** public iTunes Search API (`itunes.apple.com/search` + `/lookup`) + App Store search SSR for ranking
- **Hosting:** Vercel

---

## 3. Data model (Postgres, first cut)

- **User** — id, email, auth fields, plan (free/pro), createdAt
- **TrackedApp** — id, userId, appleId, name, developer, iconUrl, primaryGenre, country, ratingCount, avgRating, price, releaseDate, createdAt
- **Keyword** — id, term (normalized lowercase), country, popularity, difficulty, opportunity, classification, metricsUpdatedAt
- **AppKeyword** — join: appId ↔ keywordId, isCustom, addedAt (an app tracks many keywords)
- **RankSnapshot** — id, appKeywordId, position (nullable = not ranked), checkedAt
- **KeywordMetricSnapshot** — id, keywordId, popularity, difficulty, capturedAt (for trend lines)
- **CompetitorCache** — keyword+country → JSON of iTunes results + fetchedAt (TTL cache to avoid hammering the API)

---

## 4. Scoring engine port (the crux)

Port `respectaso/aso/scoring.py` + the estimator classes from `services.py` to TypeScript in
`lib/aso/`. Keep it framework-agnostic and pure so it's easy to unit-test.

- [ ] `lib/aso/itunes.ts` — search(term, country, limit), lookup(appleId, country), parse results
- [ ] `lib/aso/popularity.ts` — port `PopularityEstimator` (6 signals)
- [ ] `lib/aso/difficulty.ts` — port `DifficultyCalculator` + ranking tiers (Top 5/10/20)
- [ ] `lib/aso/downloads.ts` — port `DownloadEstimator`
- [ ] `lib/aso/opportunity.ts` — port `calc_opportunity`, `classify_keyword`, `get_targeting_advice`
- [ ] `lib/aso/rank.ts` — find an app's position for a keyword (App Store search SSR)
- [ ] Unit tests comparing a few keywords against respectaso's output (sanity parity)

---

## 5. Build phases & checklist

### Phase 0 — Project setup
- [x] Resolve open sub-decisions (ORM, DB/Auth provider) — §0 *(deferred to Phase 2; not needed for the no-DB Keyword Explorer MVP)*
- [x] `create-next-app` (TypeScript, App Router, Tailwind, Turbopack) in `~/Documents/peek-web` — Next 16, React 19, Tailwind v4
- [ ] initial commit, push to GitHub *(git repo auto-initialized by create-next-app; not committed yet)*
- [x] Dark theme + lime accent design tokens (`src/app/globals.css` `@theme`) — used lucide-react instead of shadcn/ui for now
- [x] Base layout: sidebar (appkittie-style nav) + content area (`src/components/Sidebar.tsx`, `src/app/layout.tsx`)
- [ ] Set up env handling (`.env.local`, `.env.example`) *(no env needed yet)*
- [ ] Provision Postgres (Supabase/Neon), wire ORM, run first migration *(Phase 2)*
- [ ] Connect repo to Vercel; deploy a hello-world to confirm the pipeline

### Phase 1 — Keyword Explorer (MVP) ← first end-to-end feature
- [x] iTunes Search API client (`src/lib/aso/itunes.ts`) — Next data-cache TTL (6h); DB CompetitorCache still TODO
- [x] Port scoring engine to `lib/aso/` (popularity, difficulty + tiers, downloads, opportunity, classification) — `src/lib/aso/scoring.ts`
- [x] API route `POST /api/keywords/analyze` — `src/app/api/keywords/analyze/route.ts` (orchestration in `src/lib/aso/analyze.ts`)
- [x] UI: keyword input + country selector → results (`src/app/page.tsx`)
- [x] UI: results cards (Popularity bar, Difficulty bar + label, Opportunity, classification/targeting chip)
- [x] UI: "Apps ranking for '<keyword>'" list + modal (icon, name, developer, rating, est. downloads/day, App Store link)
- [ ] Tracked Keywords: save/list/delete keywords (persisted per user) *(needs DB — Phase 2)*
- [ ] Similar keywords suggestions (from competitor titles / iTunes term variants)
- [x] Difficulty tiers display (Top 5 / 10 / 20)
- [x] **Deploy & smoke-test Keyword Explorer on Vercel** — https://peek-web-iota.vercel.app
- [ ] Unit tests for scoring parity vs respectaso *(see §4)*
- [ ] Port the finance-intent relevance guard + verify difficulty post-processing caps against respectaso (v1 approximations)

### Phase 2 — Accounts & auth  ✅ DONE
- [x] Sign up / log in / log out (email) — Supabase Auth via `@supabase/ssr`, cookie sessions
- [x] Protect dashboard routes; scope all data to userId — server actions require `getUser()`
- [ ] Free vs Pro plan flag (gate nothing yet, just the field) — deferred
- [ ] Account/settings page — deferred
- Note: email-confirm redirect fixed (Site URL + `/auth/callback` redirect URLs in Supabase); `page.tsx` forwards stray `?code` to callback as a safety net.

### Phase 3 — App Tracking  ✅ DONE
- [x] Add app flow (paste App Store URL / ID / search by name → iTunes lookup) — `actions/apps.ts addTrackedApp`, reuses `extractAppleId`/`lookupApp`/`searchApps`
- [x] App list ("Your Apps") with keyword count — `/apps` + `AppsManager.tsx`
- [x] App detail: Keywords tab (Position + delta, Popularity, Difficulty) — `/apps/[id]` + `AppDetail.tsx`
- [x] Rank lookup: find app's position per keyword (`lib/aso/rank.ts`) — uses iTunes search relevance ordering (limit 200) as a free, stable rank proxy; isolated for future SSR swap
- [x] Add/remove keywords per app — `addAppKeyword`/`removeAppKeyword`
- [x] Position History tab (chart from RankSnapshot) — inline SVG `RankChart.tsx` (rank-1-at-top, gaps for not-ranked)
- [x] **Vercel Cron** daily job → record RankSnapshot for all tracked app-keywords — `/api/cron/snapshots` (CRON_SECRET-protected), `vercel.json` schedule `0 8 * * *`
- [x] Growth sparklines fed from snapshots — per-keyword mini `RankChart` in the table
- [ ] *Future:* true App Store SSR rank parsing, KeywordMetricSnapshot trend lines, manual rank-depth tuning

### Phase 4 — Explore / discovery (appkittie parity)
- [ ] Database (browse/search apps via iTunes)
- [ ] Trending / Rising / Highlights (charts-based; may need a data source decision)
- [ ] Hot ideas (keyword opportunity finder using opportunity scoring)
- [ ] Favorites

### Phase 5 — Analytics & extras
- [ ] Reviews (pull from iTunes RSS reviews feed)
- [ ] Screenshots viewer
- [ ] Translations / localization helper
- [ ] CSV export
- [ ] Multi-country comparison (Country Opportunity Finder — port from respectaso)

### Phase 6 — Polish & launch
- [ ] Loading/empty/error states everywhere
- [ ] Rate limiting + caching hardening for iTunes API
- [ ] Responsive layout
- [ ] Onboarding / first-run
- [ ] Custom domain on Vercel
- [ ] (Optional) Billing for Pro (Stripe)

---

## 6. Risks & open questions
- **iTunes API rate limits** — Apple throttles aggressively. Must cache competitor results (CompetitorCache) and back off. respectaso has a `throttle.py` to reference.
- **Rank scraping legality/stability** — App Store search SSR parsing is gray-area and brittle; isolate it behind `lib/aso/rank.ts` so it can be swapped.
- **Estimates vs real data** — popularity/difficulty/downloads are *estimates*. Label them clearly in UI to set expectations.
- **Cron limits on Vercel** — free tier cron is limited (daily). Fine for daily snapshots; revisit if we need hourly.
- **Trending/Rising data** — appkittie's chart/trending data may need a paid source or chart-scraping; defer (Phase 4) and decide then.

---

## 7. Progress log
> Append dated entries as we build, so a future session can pick up cold.

- **2026-05-22** — Explored `respectaso` (Django, free iTunes-based scoring engine) and the Swift `Peek` app. Locked decisions (§0). Created `~/Documents/peek-web` and wrote this plan. Next: Phase 0 setup.
- **2026-05-22 (build #1)** — Phase 0 + Phase 1 MVP shipped locally.
  - Scaffolded Next 16 + React 19 + Tailwind v4 + TS; lucide-react for icons.
  - Theme tokens (ink/surface/lime) in `globals.css`; sidebar shell in `layout.tsx` + `Sidebar.tsx`; `/soon` placeholder.
  - Ported scoring engine to TS: `lib/aso/{itunes,scoring,analyze}.ts`. Popularity (6 signals), difficulty (7 weighted sub-scores + Top 5/10/20 tiers), download estimator, opportunity + classification + targeting.
  - `POST /api/keywords/analyze`; Keyword Explorer UI at `/` (metric cards, targeting chip, tier grid, apps-ranking list + modal).
  - **Verified end-to-end:** `npm run build` passes; tsc + eslint clean. `"kegel trainer"` US → pop 76 / diff 56 (Hard) / opp 47 / Moderate, with 10 real ranked apps + per-position download estimates. Note: our estimates differ from appkittie's paid-data numbers (expected).
  - **Known gaps / next:** not committed to git or deployed to Vercel; no DB yet so Tracked Keywords/accounts not persisted (Phase 2); similar-keywords suggestions, scoring parity tests, finance-intent guard still TODO.
  - **Run locally:** `cd ~/Documents/peek-web && npm run dev` (was on :3001 — port 3000 occupied).
- **2026-05-22 (build #2)** — Committed, pushed to GitHub (`iamsanketray123/peek-web`), deployed to Vercel.
  - Production URL: **https://peek-web-iota.vercel.app**
  - Inspect: https://vercel.com/iamsanketray123s-projects/peek-web
  - Smoke-tested live: "habit tracker" → pop 95 / diff 77 (Very Hard) / High Competition ✅
  - GitHub repo: https://github.com/iamsanketray123/peek-web
  - GitHub↔Vercel auto-deploy not wired yet (token scope missing). Push to GitHub then run `vercel --prod --yes` manually, OR connect the GitHub integration from the Vercel dashboard.
- **2026-05-22 (build #3)** — Phase 2 (auth) shipped. Supabase project provisioned (`aajbaootpqtzsllryuzq`), `prisma db push` created `SavedKeyword`, 4 env vars added to Vercel, deployed. Fixed email-confirm redirect (Supabase Site URL/redirect URLs + `page.tsx` `?code` forwarding).
- **2026-05-22 (build #4)** — **Phase 3 (App Tracking) shipped.**
  - DB: `prisma db push` created `TrackedApp`, `AppKeyword`, `RankSnapshot`.
  - `lib/aso/rank.ts`: verified iTunes search ordering is Apple's relevance rank (not rating-sorted) and **stable across calls** → used as a free rank proxy (limit 200; "not in top 200" = not ranked).
  - Server actions `actions/apps.ts`; UI `/apps` (`AppsManager`) + `/apps/[id]` (`AppDetail` with Keywords + Position History tabs, `RankChart` SVG).
  - Vercel Cron `/api/cron/snapshots` daily @ 08:00 UTC, `CRON_SECRET`-protected (verified 401 without bearer in prod).
  - Sidebar "App Tracking" → `/apps`, active-state now matches sub-routes.
  - Build clean; all routes (`/apps`, `/apps/[id]`, `/api/cron/snapshots`) live & smoke-tested.
  - **Next session:** verify the authed add-app → add-keyword → rank flow end-to-end in the browser; consider Phase 4 (Explore/discovery) or settings/account page + Pro flag.

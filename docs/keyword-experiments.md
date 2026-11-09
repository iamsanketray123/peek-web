# Keyword experiment notebook

The `/experiments` workspace reuses tracked apps and keyword snapshots from App
Tracking. `/experiments/demo` is a read-only, synthetic example and never writes
data. Live workspaces require Supabase authentication; every server action checks
ownership of the parent tracked app. Each app record represents one storefront.

## Workflow

1. Track the app and relevant non-brand keywords in App Tracking. Collection cannot
   reconstruct the past. The existing Vercel cron captures positions; verify its
   successful runs and use the app's manual refresh when needed.
2. Create an experiment with a hypothesis, exact before/after metadata, a baseline,
   live date, observation end date and settling period. Nothing is published to Apple.
3. Log Twitter/Reddit posts, paid ads, other releases, and the last day of meaningful
   visibility. Set a conservative cooldown; 3 days is an editable assumption, not
   an established attribution window. Extend it when exposure persists.
4. Explicitly confirm past no-promotion days. No logged event does **not** establish
   a quiet day. A promotion/cooldown always overrides a quiet declaration.
5. Import daily first-time download source counts. Use the provided normalized CSV
   template, filter the same country, and align dates to UTC. This version does not
   ingest arbitrary App Store Connect exports or connect to its API automatically.
   Do not relabel local-time daily totals as UTC; prepare aligned reports first.
6. Compare quiet-period averages and keyword persistence after the spike. Record a
   conclusion, keep/revert decision and confounders. Status is user-controlled.

## Measurement guardrails

- Positions are iTunes Search API proxies, not verified on-device App Store ranks.
- Rank charts keep the last observation per UTC day. Missing days and not-found
  observations break lines; neither becomes zero or an invented rank of 201.
- Keyword median positions exclude not-found observations. The accompanying
  found/checked coverage is necessary to avoid survivorship bias.
- Quiet comparison uses only confirmed quiet days with reported search downloads.
  Promotions, cooldowns, settling days and future dates are excluded. Missing counts
  stay null; measured zero stays zero. Rates use reported-day counts, not the full
  interval. At least 7 reported quiet days in each period are required to display
  the directional percentage. This rule is **not** statistical significance.
- First-time App Store Search downloads may include Apple Ads and social-driven
  searches. App-level source totals cannot identify individual organic keyword
  downloads. No automatic "winner", causal lift, or keyword-to-download claim is made.
- Overlapping experiments and separately logged release/metadata events are flagged.
- Same-weekday comparisons and 14–28 day observation windows are preferable to
  judging a single spike. Seasonality and unobserved exposure can still confound.
- Local MCP snapshots are separate from the website DB and are not auto-imported.

## Storage / deployment

The three additive Prisma models are `KeywordExperiment`, `ExperimentEvent` and
`AcquisitionDay`. Existing apps and rank snapshots are unchanged. For a database
using the repository's `prisma db push` workflow, either push the schema or apply
only the additive, idempotent SQL:

```sh
npx prisma db execute --file prisma/experiments.sql --schema prisma/schema.prisma
npx prisma generate
```

The SQL enables RLS on new tables with no browser-role policies. Access goes through
the privileged server Prisma connection after ownership checks, not Supabase's
public browser API. Production must use the same schema before deploying the UI.
CSV replacement requires explicit confirmation; validation finishes before any
transaction writes. Import replaces whole matching daily rows, including blanks.

## References and product research

- [AppTweak chart notes](https://feedback.apptweak.com/help/articles/5020936-add-chart-notes-to-keep-track-of-major-events): app/storefront-scoped annotations shared across graphs.
- [AppFollow annotations](https://support.appfollow.io/hc/en-us/articles/4404723819281-Enable-Chart-Annotations): releases and campaign notes on keyword and traffic charts.
- [Apple acquisition definitions](https://developer.apple.com/help/app-store-connect-analytics/acquisition/acquisition/): download-source metrics and the search/ads caveat.
- [Apple campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links): campaign tokens, reporting thresholds, and direct-referral measurement.

The UI/UX guidance informed accessible line charts with legends, missing-data gaps,
and table alternatives; Peek's existing dark/lime theme and Geist fonts are retained.

## Validation

```sh
node --experimental-strip-types --test tests/experiments.test.mjs tests/reviews.test.mjs
npm --prefix mcp test
npm run build
```

The experiment tests cover ownership guards, calendar/CSV validation, missing data,
promotion overrides/cooldowns, settling windows, minimum sample coverage and zero
baselines. Database schema writes and tenant filtering were checked in a transaction
that was deliberately rolled back, leaving no test records. Mobile (375px) and
desktop (1440px) charts/context controls were checked against the synthetic demo.

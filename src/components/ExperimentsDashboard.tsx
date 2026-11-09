"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Plus,
  Megaphone,
  Upload,
  ArrowUpRight,
  Info,
  Loader2,
  X,
  Check,
  Download,
} from "lucide-react";
import ExperimentChart from "./ExperimentChart";
import {
  createExperiment,
  createExperimentEvent,
  importAcquisition,
  removeExperimentEvent,
  saveExperimentOutcome,
} from "@/app/actions/experiments";
import {
  addDays,
  dailyRanks,
  dayContext,
  experimentSummary,
  todayUTC,
  type ExperimentWorkspace,
} from "@/lib/experiments";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm text-white outline-none focus:border-lime focus:ring-2 focus:ring-lime/15";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:border-lime/40 focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40 cursor-pointer";
const cardClass = "rounded-2xl border border-line bg-surface p-5 sm:p-6";
const format = (n: number | null) => (n == null ? "—" : n.toFixed(1));

export default function ExperimentsDashboard({
  data,
  apps,
  demo = false,
}: {
  data: ExperimentWorkspace;
  apps: { id: string; name: string; country: string }[];
  demo?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.experiments[0]?.id ?? "");
  const [keyword, setKeyword] = useState("");
  const [panel, setPanel] = useState<"experiment" | "event" | "import" | null>(
    null,
  );
  const [eventKind, setEventKind] = useState("promotion");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [csv, setCsv] = useState("");
  const experiment =
    data.experiments.find((e) => e.id === selectedId) ?? data.experiments[0];
  const selectedKeyword = experiment?.keywords.includes(keyword)
    ? keyword
    : (experiment?.keywords[0] ?? "");
  const summary = experiment ? experimentSummary(experiment, data) : null;
  const today = todayUTC();
  const visibleEvents = data.events.filter(
    (e) =>
      !experiment ||
      (e.startDate <= experiment.endDate &&
        addDays(e.endDate, e.cooldownDays) >= experiment.baselineStart),
  );

  function submit(
    action: (form: FormData) => Promise<{ ok: boolean; error?: string }>,
    close = true,
  ) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (demo) {
        setMessage({
          error: false,
          text: "This is a read-only demo. Sign in and select a tracked app to save your own experiments.",
        });
        return;
      }
      const form = new FormData(event.currentTarget);
      setBusy(true);
      setMessage(null);
      try {
        const result = await action(form);
        if (!result.ok) {
          setMessage({
            error: true,
            text: result.error ?? "Could not save. Please try again.",
          });
          return;
        }
        setMessage({
          error: false,
          text: "Saved. Your experiment workspace is up to date.",
        });
        if (close) setPanel(null);
        router.refresh();
      } catch (error) {
        setMessage({ error: true, text: (error as Error).message });
      } finally {
        setBusy(false);
      }
    };
  }
  const appIdField = <input type="hidden" name="appId" value={data.app.id} />;
  function template() {
    const content =
      "date,searchDownloads,webReferrals,appReferrals,browseDownloads\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "peek-daily-downloads-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-8">
      {demo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <span>
            <strong>Demo workspace.</strong> All chart data is synthetic, not
            Medo’s real performance. Nothing here is saved.
          </span>
          <Link href="/experiments" className="underline underline-offset-4">
            Open my workspace
          </Link>
        </div>
      )}
      <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-lime">
            <FlaskConical size={14} /> The experiment notebook
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Find growth that stays.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Track keyword changes, separate promotion spikes, and compare what
            happens on the quiet days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            onClick={() => setPanel(panel === "event" ? null : "event")}
          >
            <Megaphone size={15} />
            Log context
          </button>
          <button
            className={buttonClass}
            onClick={() => setPanel(panel === "import" ? null : "import")}
          >
            <Upload size={15} />
            Import downloads
          </button>
          <button
            className={`${buttonClass} border-lime/40 bg-lime! text-ink! hover:bg-lime-dim!`}
            onClick={() =>
              setPanel(panel === "experiment" ? null : "experiment")
            }
          >
            <Plus size={16} />
            New experiment
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <label className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-muted">
          Workspace{" "}
          <select
            aria-label="App and storefront"
            className="max-w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-white focus:outline-lime"
            value={data.app.id}
            disabled={demo}
            onChange={(e) =>
              router.push(
                `/experiments?app=${encodeURIComponent(e.target.value)}`,
              )
            }
          >
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.country.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="rounded-full border border-line px-2.5 py-1">
            UTC dates
          </span>
          <span>{data.app.country.toUpperCase()} storefront only</span>
          {!demo && (
            <Link
              href={`/apps/${data.app.id}`}
              className="inline-flex items-center gap-1 text-lime"
            >
              Tracked keywords <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </div>
      {message && (
        <div
          role={message.error ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-lime/30 bg-lime/5 text-lime"}`}
        >
          {message.text}
        </div>
      )}
      {panel && (
        <section className={cardClass} aria-label="Experiment editor">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {panel === "experiment"
                ? "Design an experiment"
                : panel === "event"
                  ? "Add context to the timeline"
                  : "Bring in actual download data"}
            </h2>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2 focus:outline-lime"
              aria-label="Close editor"
              onClick={() => setPanel(null)}
            >
              <X size={18} />
            </button>
          </div>
          {panel === "experiment" && (
            <form onSubmit={submit(createExperiment)} className="space-y-4">
              {appIdField}
              <p className="text-sm text-muted">
                Change one thing at a time. This records your plan—it does not
                publish metadata to Apple. Start with 7–14 baseline days and
                observe at least 14–28 days after a change.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Experiment name">
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={120}
                    placeholder="Lead with medication reminder"
                    className={inputClass}
                  />
                </Field>
                <Field label="Hypothesis">
                  <input
                    name="hypothesis"
                    required
                    maxLength={4000}
                    placeholder="A clearer title will sustain search discovery…"
                    className={inputClass}
                  />
                </Field>
                <Field label="Before: title / subtitle / keyword field">
                  <textarea
                    name="before"
                    required
                    maxLength={4000}
                    rows={3}
                    className={inputClass}
                  />
                </Field>
                <Field label="After: exactly what changed">
                  <textarea
                    name="after"
                    required
                    maxLength={4000}
                    rows={3}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Baseline starts (UTC)">
                  <input
                    type="date"
                    name="baselineStart"
                    defaultValue={addDays(today, -14)}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Change goes live (UTC)">
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={today}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Observe through (UTC)">
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={addDays(today, 28)}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Settling days to exclude">
                  <input
                    name="settleDays"
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={3}
                    required
                    className={inputClass}
                  />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm text-muted">
                  Watchlist · select up to 12 already-tracked keywords
                </legend>
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {data.keywords.map((k) => (
                    <label
                      key={k.id}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-ink px-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="keywords"
                        value={k.term}
                        className="accent-lime"
                      />
                      {k.term}
                    </label>
                  ))}
                </div>
                {!data.keywords.length && (
                  <p className="text-sm text-amber-200">
                    Add keywords in App Tracking first. We cannot backfill past
                    rankings.
                  </p>
                )}
              </fieldset>
              <Submit
                busy={busy}
                disabled={!data.keywords.length}
                label="Save experiment"
              />
            </form>
          )}
          {panel === "event" && (
            <form
              onSubmit={submit(createExperimentEvent)}
              className="space-y-4"
            >
              {appIdField}
              <p className="text-sm text-muted">
                Context applies to every experiment for this app and storefront.
                Promotions override quiet labels, including the cooldown period.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Context type">
                  <select
                    name="kind"
                    value={eventKind}
                    onChange={(e) => setEventKind(e.target.value)}
                    className={inputClass}
                  >
                    <option value="promotion">Promotion / post / ads</option>
                    <option value="quiet">Confirmed no-promotion window</option>
                    <option value="metadata">
                      Other release / metadata change
                    </option>
                  </select>
                </Field>
                <Field label="Title / channel">
                  <input
                    name="title"
                    autoFocus
                    required
                    maxLength={120}
                    placeholder={
                      eventKind === "promotion"
                        ? "Reddit post · r/ADHD"
                        : "What happened?"
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Starts (UTC)">
                  <input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={today}
                    className={inputClass}
                  />
                </Field>
                <Field label="Ends / last visible day (UTC)">
                  <input
                    name="endDate"
                    type="date"
                    required
                    defaultValue={today}
                    className={inputClass}
                  />
                </Field>
                {eventKind === "promotion" && (
                  <>
                    <Field label="Cooldown days after visibility ends">
                      <input
                        name="cooldownDays"
                        type="number"
                        min={0}
                        max={30}
                        defaultValue={3}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Post or ASC campaign link (optional)">
                      <input
                        name="url"
                        type="url"
                        maxLength={2000}
                        placeholder="https://…"
                        className={inputClass}
                      />
                    </Field>
                  </>
                )}
              </div>
              {eventKind !== "promotion" && (
                <input type="hidden" name="url" value="" />
              )}
              <Field label="Notes · visibility, ad activity, confounders">
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={4000}
                  className={inputClass}
                />
              </Field>
              {eventKind === "quiet" && (
                <label className="flex items-start gap-3 rounded-xl border border-sky-300/20 bg-sky-300/5 p-4 text-sm text-muted">
                  <input
                    className="mt-1 accent-lime"
                    type="checkbox"
                    name="confirmedQuiet"
                    required
                  />
                  I confirm these past/present dates had no posts, paid ads or
                  other promotion that I know of. This is a user report, not
                  proof that external exposure was zero.
                </label>
              )}
              <Submit busy={busy} label="Save context" />
            </form>
          )}
          {panel === "import" && (
            <form onSubmit={submit(importAcquisition)} className="space-y-4">
              {appIdField}
              <p className="text-sm leading-relaxed text-muted">
                Export first-time downloads by source for{" "}
                <strong className="text-white">
                  {data.app.country.toUpperCase()}
                </strong>{" "}
                from App Store Connect, then reshape into this template. This is
                not a direct ASC export parser. Use UTC-aligned daily counts; do
                not relabel local-day totals. Blank = missing/unreported; 0 =
                measured zero. Reports are not connected automatically.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={template}
                >
                  <Download size={15} />
                  CSV template
                </button>
                <label className={`${buttonClass} cursor-pointer`}>
                  Choose CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 100000) {
                        setMessage({
                          error: true,
                          text: "Maximum file size is 100 KB.",
                        });
                        return;
                      }
                      setCsv(await file.text());
                    }}
                  />
                </label>
              </div>
              <Field label="CSV data · date,searchDownloads,webReferrals,appReferrals,browseDownloads">
                <textarea
                  name="csv"
                  required
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={6}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder={
                    "date,searchDownloads,webReferrals,appReferrals,browseDownloads\n2026-11-01,8,2,0,1"
                  }
                />
              </Field>
              <Field label="Source note · report filters, date alignment, Apple Ads activity">
                <input
                  name="sourceNote"
                  required
                  maxLength={500}
                  placeholder="ASC first-time downloads; US; UTC; no Apple Ads during this window…"
                  className={inputClass}
                />
              </Field>
              <label className="flex items-start gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  name="confirmedScope"
                  required
                  className="mt-1 accent-lime"
                />
                I checked the country, first-time download metric and UTC date
                alignment. Search may include Apple Ads or social-driven brand
                searches.
              </label>
              <label className="flex items-start gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  name="overwrite"
                  className="mt-1 accent-lime"
                />
                Replace existing data on matching dates (for corrections).
              </label>
              <Submit busy={busy} label="Import daily counts" />
            </form>
          )}
        </section>
      )}
      {!experiment ? (
        <section className={`${cardClass} py-16! text-center`}>
          <FlaskConical size={32} className="mx-auto mb-4 text-lime" />
          <h2 className="text-xl font-semibold">
            Your next keyword change deserves a notebook.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            Record a hypothesis and before/after metadata. Your existing
            tracked-keyword history becomes the baseline. Add promotion dates
            and download counts to understand what lasted.
          </p>
          <button
            className={`${buttonClass} mt-6`}
            onClick={() => setPanel("experiment")}
          >
            <Plus size={15} />
            Create the first experiment
          </button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Select experiment">
            {data.experiments.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setSelectedId(e.id);
                  setKeyword("");
                }}
                aria-pressed={e.id === experiment.id}
                className={`${buttonClass} ${e.id === experiment.id ? "border-lime/50 bg-lime/5! text-lime!" : ""}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${e.status === "running" ? "bg-lime" : "bg-muted"}`}
                />
                {e.name}
              </button>
            ))}
          </div>
          <section className={cardClass}>
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-full border border-lime/25 bg-lime/5 px-2.5 py-1 text-lime">
                    {experiment.status}
                  </span>
                  <span>
                    {experiment.startDate} → {experiment.endDate}
                  </span>
                </div>
                <h2 className="text-xl font-semibold">{experiment.name}</h2>
                <p className="mt-2 max-w-3xl text-sm text-muted">
                  {experiment.hypothesis}
                </p>
              </div>
              <div className="shrink-0 text-xs leading-6 text-muted">
                Baseline: {experiment.baselineStart}
                <br />
                Settling window: {experiment.settleDays} days excluded
              </div>
            </div>
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer py-1 text-sm text-lime focus:outline-lime">
                Inspect the metadata change
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-ink p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                    Before
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {experiment.before}
                  </p>
                </div>
                <div className="rounded-xl border border-lime/15 bg-ink p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-lime">
                    After
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {experiment.after}
                  </p>
                </div>
              </div>
            </details>
          </section>
          {summary && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Baseline · quiet search / day"
                  value={format(summary.before.average)}
                  note={`${summary.before.reportedDays} reported / ${summary.before.quietDays} confirmed quiet days`}
                />
                <Stat
                  label="After · quiet search / day"
                  value={format(summary.post.average)}
                  note={`${summary.post.reportedDays} reported / ${summary.post.quietDays} confirmed quiet days`}
                />
                <Stat
                  label="Quiet-period comparison"
                  value={
                    summary.enough && summary.change != null
                      ? `${summary.change > 0 ? "+" : ""}${summary.change.toFixed(0)}%`
                      : "Collecting"
                  }
                  note={
                    summary.enough
                      ? "Observed difference, not a causal lift"
                      : "Need 7 reported quiet days per period"
                  }
                />
                <Stat
                  label="Promotion-affected days"
                  value={String(summary.promotionDays)}
                  note="Excluded, including your chosen cooldown"
                />
              </div>
              <div
                className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${summary.overlaps || summary.otherChanges ? "border-amber-400/30 bg-amber-400/5 text-amber-200" : "border-line bg-surface/50 text-muted"}`}
              >
                <Info size={15} className="mr-2 inline" />
                {summary.overlaps
                  ? `${summary.overlaps} overlapping experiment(s). Separate their changes before attributing a result. `
                  : ""}
                {summary.otherChanges
                  ? `${summary.otherChanges} other release/metadata event(s) may confound this result. `
                  : ""}
                Only explicitly confirmed quiet days enter the comparison;
                unlogged days are unknown. Seven days is a minimum coverage
                rule, not statistical significance. Search totals cannot
                identify an individual keyword’s downloads.
              </div>
            </>
          )}
          <section className={cardClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  Keyword position, with the full context
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Look for persistence after the amber promotion window—not just
                  a peak.
                </p>
              </div>
              <select
                value={selectedKeyword}
                onChange={(e) => setKeyword(e.target.value)}
                aria-label="Chart keyword"
                className="rounded-lg border border-line bg-ink px-3 py-2.5 text-sm focus:outline-lime"
              >
                {experiment.keywords.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <ExperimentChart
              data={data}
              experiment={experiment}
              keyword={selectedKeyword}
              metric="rank"
            />
          </section>
          <section className={cardClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  Was discovery sustained, or just borrowed?
                </h3>
                <p className="mt-1 text-xs text-muted">
                  App-level source trends. Promotion can also spill into search
                  downloads.
                </p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                {demo
                  ? "Synthetic demo counts"
                  : "Manually imported ASC counts"}
              </span>
            </div>
            <ExperimentChart
              data={data}
              experiment={experiment}
              keyword={selectedKeyword}
              metric="downloads"
            />
          </section>
          <section className={cardClass}>
            <h3 className="mb-2 font-semibold">
              Watchlist · quiet-period persistence
            </h3>
            <p className="mb-4 text-xs text-muted">
              Median positions use ranked observations only. Always read them
              with “found / checked” coverage; missing days are not counted as a
              rank.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="pb-3 font-medium">Keyword</th>
                    <th className="pb-3 font-medium">Baseline median</th>
                    <th className="pb-3 font-medium">After median</th>
                    <th className="pb-3 font-medium">
                      After · found / checked
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {experiment.keywords.map((term) => {
                    const points = dailyRanks(
                      data.keywords.find((k) => k.term === term)?.history ?? [],
                    ).filter(
                      (p) =>
                        p.date <= today &&
                        dayContext(p.date, data.events) === "quiet",
                    );
                    const base = points.filter(
                      (p) =>
                        p.date >= experiment.baselineStart &&
                        p.date < experiment.startDate,
                    );
                    const after = points.filter(
                      (p) =>
                        p.date >=
                          addDays(
                            experiment.startDate,
                            experiment.settleDays,
                          ) && p.date <= experiment.endDate,
                    );
                    const median = (list: typeof points) => {
                      const values = list
                        .map((p) => p.position)
                        .filter((v): v is number => v != null)
                        .sort((a, b) => a - b);
                      const m = Math.floor(values.length / 2);
                      return values.length
                        ? values.length % 2
                          ? values[m]
                          : (values[m - 1] + values[m]) / 2
                        : null;
                    };
                    return (
                      <tr key={term} className="border-t border-line">
                        <td className="py-4">
                          <button
                            onClick={() => setKeyword(term)}
                            className="text-left text-lime underline-offset-4 hover:underline focus:outline-lime"
                          >
                            {term}
                          </button>
                        </td>
                        <td className="font-mono">
                          {median(base) == null
                            ? "—"
                            : `#${format(median(base))}`}
                          <span className="ml-2 text-xs text-muted">
                            ({base.filter((p) => p.position != null).length}/
                            {base.length})
                          </span>
                        </td>
                        <td className="font-mono">
                          {median(after) == null
                            ? "—"
                            : `#${format(median(after))}`}
                        </td>
                        <td>
                          {after.filter((p) => p.position != null).length} /{" "}
                          {after.length}
                          {after.length < 7 && (
                            <span className="ml-2 text-xs text-muted">
                              limited history
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Context journal</h3>
                <button
                  className="min-h-11 px-2 text-sm text-lime focus:outline-lime"
                  onClick={() => setPanel("event")}
                >
                  + Add
                </button>
              </div>
              {!visibleEvents.length && (
                <p className="text-sm text-muted">
                  No context recorded. Log posts and confirm quiet windows—no
                  events does not mean no promotion.
                </p>
              )}
              <ol className="max-h-96 space-y-3 overflow-auto">
                {visibleEvents.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-xl border border-line bg-ink/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={`text-xs font-medium ${e.kind === "promotion" ? "text-amber-300" : e.kind === "quiet" ? "text-sky-200" : "text-violet-300"}`}
                        >
                          {e.kind === "quiet"
                            ? "Confirmed quiet"
                            : e.kind === "metadata"
                              ? "Other change"
                              : "Promotion"}
                        </span>
                        <p className="mt-1 text-sm font-medium">{e.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {e.startDate} → {e.endDate}
                          {e.kind === "promotion"
                            ? ` + ${e.cooldownDays}d cooldown`
                            : ""}
                        </p>
                      </div>
                      <form
                        onSubmit={(event) => {
                          if (
                            !demo &&
                            !window.confirm(
                              "Remove this timeline entry? Quiet-period calculations will update.",
                            )
                          ) {
                            event.preventDefault();
                            return;
                          }
                          void submit(removeExperimentEvent, false)(event);
                        }}
                      >
                        {appIdField}
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          disabled={busy}
                          className="min-h-11 px-2 text-xs text-muted hover:text-red-300 focus:outline-lime"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                    {e.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                        {e.notes}
                      </p>
                    )}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs text-lime"
                      >
                        Open link <ArrowUpRight size={12} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section className={cardClass}>
              <h3 className="mb-2 font-semibold">
                Keep a decision, not just a graph.
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-muted">
                Record what you learned, what else changed, and whether you will
                keep or revert the metadata. This is your assessment, not an
                automated winner.
              </p>
              <form
                key={experiment.id}
                onSubmit={submit(saveExperimentOutcome, false)}
                className="space-y-4"
              >
                {appIdField}
                <input type="hidden" name="id" value={experiment.id} />
                <Field label="Experiment status">
                  <select
                    name="status"
                    defaultValue={experiment.status}
                    className={inputClass}
                  >
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                    <option value="inconclusive">Inconclusive</option>
                  </select>
                </Field>
                <Field label="Conclusion / next step">
                  <textarea
                    name="conclusion"
                    maxLength={4000}
                    defaultValue={experiment.conclusion}
                    rows={4}
                    className={inputClass}
                    placeholder="After the post faded, search stayed near… Confounders included… Next I will…"
                  />
                </Field>
                <Submit busy={busy} label="Save learning" />
              </form>
            </section>
          </div>
        </>
      )}
      <details className={cardClass} open={!experiment}>
        <summary className="cursor-pointer text-sm font-semibold focus:outline-lime">
          How to find keywords that bring downloads without constant posting
        </summary>
        <div className="mt-5 grid gap-5 text-sm leading-relaxed text-muted md:grid-cols-3">
          <div>
            <span className="mb-2 block text-lime">
              01 · Establish the floor
            </span>
            Track relevant, non-brand keywords and collect 7–14 quiet baseline
            days. Import first-time downloads by source. A gap is unknown—not
            zero.
          </div>
          <div>
            <span className="mb-2 block text-lime">02 · Change one thing</span>
            Log the exact title, subtitle or keyword-field change. Record every
            post, ad, release and the last day of exposure. A social spike can
            increase searches too.
          </div>
          <div>
            <span className="mb-2 block text-lime">
              03 · Look beyond the spike
            </span>
            Wait through your settling/cooldown periods. Compare 14–28 days
            where possible, including the same weekdays. Persistent ranks plus
            sustained search downloads are directional evidence, not per-keyword
            attribution.
          </div>
        </div>
        <div className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Peek uses iTunes search result positions, not verified on-device App
          Store rankings. Organic keyword-level downloads are not measured here.
          Use{" "}
          <a
            className="text-lime underline"
            href="https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links"
            target="_blank"
            rel="noreferrer"
          >
            Apple campaign links
          </a>{" "}
          on posts to help distinguish direct referrals, noting reporting
          thresholds. Other influences include seasonality, featuring,
          competitor changes, and Apple Ads. Rank history comes from App
          Tracking; local MCP history is not synced automatically.
        </div>
      </details>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      {children}
    </label>
  );
}
function Submit({
  busy,
  disabled = false,
  label,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={`${buttonClass} border-lime/40 text-lime`}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Check size={15} />
      )}
      {busy ? "Saving…" : label}
    </button>
  );
}
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="my-3 font-mono text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

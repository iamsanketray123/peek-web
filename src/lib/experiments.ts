/** Measurement helpers shared by server, charts and tests. Dates are UTC days. */
export class ExperimentInputError extends Error {}
/** Shared guard: resolve the app only inside the authenticated user's scope. */
export async function requireExperimentApp<T>(
  appId: string,
  getUser: () => Promise<{ id: string } | null>,
  findApp: (appId: string, userId: string) => Promise<T | null>,
): Promise<T> {
  const user = await getUser();
  if (!user) throw new ExperimentInputError("Sign in to manage experiments.");
  const app = await findApp(appId, user.id);
  if (!app) throw new ExperimentInputError("App not found or access denied.");
  return app;
}
export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  keywords: string[];
  before: string;
  after: string;
  baselineStart: string;
  startDate: string;
  endDate: string;
  settleDays: number;
  status: string;
  conclusion: string;
}
export interface TimelineEvent {
  id: string;
  kind: "promotion" | "metadata" | "quiet";
  title: string;
  startDate: string;
  endDate: string;
  cooldownDays: number;
  url: string;
  notes: string;
}
export interface Acquisition {
  date: string;
  searchDownloads: number | null;
  webReferrals: number | null;
  appReferrals: number | null;
  browseDownloads: number | null;
  sourceNote: string;
}
export interface KeywordSeries {
  id: string;
  term: string;
  history: { date: string; position: number | null }[];
}
export interface ExperimentWorkspace {
  app: { id: string; name: string; country: string; appleId: string };
  experiments: Experiment[];
  events: TimelineEvent[];
  acquisition: Acquisition[];
  keywords: KeywordSeries[];
}
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export function validDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function addDays(day: string, count: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function daysBetween(start: string, end: string): string[] {
  if (!validDay(start) || !validDay(end) || start > end) return [];
  const count =
    Math.floor((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return Array.from({ length: Math.min(count, 366) }, (_, i) =>
    addDays(start, i),
  );
}
export function dayContext(
  day: string,
  events: TimelineEvent[],
): "promotion" | "quiet" | "unclassified" {
  if (
    events.some(
      (e) =>
        e.kind === "promotion" &&
        day >= e.startDate &&
        day <= addDays(e.endDate, e.cooldownDays),
    )
  )
    return "promotion";
  if (
    events.some(
      (e) => e.kind === "quiet" && day >= e.startDate && day <= e.endDate,
    )
  )
    return "quiet";
  return "unclassified";
}
export function dailyRanks(
  history: { date: string; position: number | null }[],
) {
  const byDay = new Map<string, { date: string; position: number | null }>();
  [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p) =>
      byDay.set(p.date.slice(0, 10), { ...p, date: p.date.slice(0, 10) }),
    );
  return [...byDay.values()];
}
export function experimentSummary(
  experiment: Experiment,
  data: ExperimentWorkspace,
  today = todayUTC(),
) {
  const baseline = daysBetween(
    experiment.baselineStart,
    addDays(experiment.startDate, -1),
  ).filter((d) => d <= today);
  const after = daysBetween(
    addDays(experiment.startDate, experiment.settleDays),
    experiment.endDate < today ? experiment.endDate : today,
  );
  const summarize = (days: string[]) => {
    const quiet = days.filter((d) => dayContext(d, data.events) === "quiet");
    const counts = quiet
      .map((d) => data.acquisition.find((a) => a.date === d)?.searchDownloads)
      .filter((n): n is number => n != null);
    return {
      totalDays: days.length,
      quietDays: quiet.length,
      reportedDays: counts.length,
      average: counts.length
        ? counts.reduce((a, b) => a + b, 0) / counts.length
        : null,
    };
  };
  const before = summarize(baseline),
    post = summarize(after);
  const enough = before.reportedDays >= 7 && post.reportedDays >= 7;
  const change =
    before.average != null && before.average > 0 && post.average != null
      ? ((post.average - before.average) / before.average) * 100
      : null;
  const overlaps = data.experiments.filter(
    (e) =>
      e.id !== experiment.id &&
      e.startDate <= experiment.endDate &&
      e.endDate >= experiment.baselineStart,
  );
  const otherChanges = data.events.filter(
    (e) =>
      e.kind === "metadata" &&
      e.startDate <= experiment.endDate &&
      e.endDate >= experiment.baselineStart,
  ).length;
  return {
    before,
    post,
    enough,
    change,
    overlaps: overlaps.length,
    otherChanges,
    promotionDays: daysBetween(
      experiment.baselineStart,
      experiment.endDate < today ? experiment.endDate : today,
    ).filter((d) => dayContext(d, data.events) === "promotion").length,
  };
}
/** Strict, normalized CSV template, NOT a claim to accept arbitrary ASC exports. */
export function parseAcquisitionCSV(csv: string): Acquisition[] {
  if (csv.length > 100000)
    throw new Error("CSV is too large (maximum 100 KB).");
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (
    lines[0] !==
    "date,searchDownloads,webReferrals,appReferrals,browseDownloads"
  )
    throw new Error("Use the CSV template header exactly as provided.");
  if (lines.length < 2 || lines.length > 367)
    throw new Error("Provide between 1 and 366 daily rows.");
  const seen = new Set<string>();
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const date = cells[0];
    if (
      cells.length !== 5 ||
      !validDay(date) ||
      date > todayUTC() ||
      seen.has(date)
    )
      throw new Error(`Invalid, future or duplicate date on row ${i + 2}.`);
    seen.add(date);
    const counts = cells.slice(1).map((c) => {
      if (c === "") return null;
      if (!/^\d+$/.test(c) || Number(c) > 100000000)
        throw new Error(
          `Invalid count on row ${i + 2}. Use blank for missing data, 0 for measured zero.`,
        );
      return Number(c);
    });
    if (counts.every((c) => c === null))
      throw new Error(`Row ${i + 2} has no counts.`);
    return {
      date,
      searchDownloads: counts[0],
      webReferrals: counts[1],
      appReferrals: counts[2],
      browseDownloads: counts[3],
      sourceNote: "Manual ASC CSV",
    };
  });
}

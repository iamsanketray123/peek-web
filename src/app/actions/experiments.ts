"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import {
  addDays,
  validDay,
  todayUTC,
  parseAcquisitionCSV,
  ExperimentInputError,
  requireExperimentApp,
  type ExperimentWorkspace,
  type TimelineEvent,
} from "@/lib/experiments";

async function ownedApp(appId: string) {
  return requireExperimentApp(appId, getUser, (id, userId) =>
    prisma.trackedApp.findFirst({ where: { id, userId } }),
  );
}
function text(form: FormData, key: string, max = 4000) {
  const value = form.get(key);
  if (typeof value !== "string" || value.length > max)
    throw new ExperimentInputError(`Invalid ${key}.`);
  return value.trim();
}
function day(form: FormData, key: string) {
  const value = text(form, key, 10);
  if (!validDay(value)) throw new ExperimentInputError(`Invalid ${key} date.`);
  return value;
}
function integer(form: FormData, key: string, max: number) {
  const value = text(form, key, 5);
  if (!/^\d+$/.test(value) || Number(value) > max)
    throw new ExperimentInputError(`Invalid ${key}.`);
  return Number(value);
}
const refresh = () => revalidatePath("/experiments");

export async function getExperimentWorkspace(
  appId: string,
): Promise<ExperimentWorkspace> {
  const app = await ownedApp(appId);
  const since = new Date(addDays(todayUTC(), -365));
  const [experiments, events, acquisition, keywords] = await Promise.all([
    prisma.keywordExperiment.findMany({
      where: { appId },
      orderBy: { startDate: "desc" },
      take: 100,
    }),
    prisma.experimentEvent.findMany({
      where: { appId },
      orderBy: { startDate: "asc" },
    }),
    prisma.acquisitionDay.findMany({
      where: { appId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.appKeyword.findMany({
      where: { appId },
      orderBy: { term: "asc" },
      include: {
        snapshots: {
          where: { checkedAt: { gte: since } },
          orderBy: { checkedAt: "asc" },
        },
      },
    }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    app: {
      id: app.id,
      name: app.name,
      country: app.country,
      appleId: app.appleId,
    },
    experiments: experiments.map((e) => ({
      ...e,
      baselineStart: iso(e.baselineStart),
      startDate: iso(e.startDate),
      endDate: iso(e.endDate),
    })),
    events: events.map((e) => ({
      ...e,
      kind: e.kind as TimelineEvent["kind"],
      startDate: iso(e.startDate),
      endDate: iso(e.endDate),
    })),
    acquisition: acquisition.map((a) => ({ ...a, date: iso(a.date) })),
    keywords: keywords.map((k) => ({
      id: k.id,
      term: k.term,
      history: k.snapshots.map((s) => ({
        date: s.checkedAt.toISOString(),
        position: s.position,
      })),
    })),
  };
}

async function createExperimentMutation(form: FormData) {
  const appId = text(form, "appId", 100);
  await ownedApp(appId);
  const name = text(form, "name", 120),
    hypothesis = text(form, "hypothesis");
  const before = text(form, "before"),
    after = text(form, "after");
  const baselineStart = day(form, "baselineStart"),
    startDate = day(form, "startDate"),
    endDate = day(form, "endDate");
  const settleDays = integer(form, "settleDays", 30);
  if (!name || !hypothesis || !before || !after)
    throw new ExperimentInputError(
      "Add a name, hypothesis, and the before/after metadata.",
    );
  if (
    baselineStart >= startDate ||
    startDate > endDate ||
    baselineStart < addDays(todayUTC(), -365) ||
    endDate > addDays(baselineStart, 365)
  )
    throw new ExperimentInputError(
      "Use a baseline before the change date and a test ending within one year of the baseline.",
    );
  const terms = form
    .getAll("keywords")
    .filter((v): v is string => typeof v === "string");
  const keywords = [...new Set(terms)];
  if (!keywords.length || keywords.length > 12)
    throw new ExperimentInputError("Select 1–12 tracked keywords.");
  const count = await prisma.appKeyword.count({
    where: { appId, term: { in: keywords } },
  });
  if (count !== keywords.length)
    throw new ExperimentInputError("Select keywords tracked for this app.");
  await prisma.keywordExperiment.create({
    data: {
      appId,
      name,
      hypothesis,
      keywords,
      before,
      after,
      baselineStart: new Date(baselineStart),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      settleDays,
    },
  });
  refresh();
}

async function saveExperimentOutcomeMutation(form: FormData) {
  const appId = text(form, "appId", 100);
  await ownedApp(appId);
  const id = text(form, "id", 100),
    conclusion = text(form, "conclusion");
  const status = text(form, "status", 20);
  if (!["running", "completed", "inconclusive"].includes(status))
    throw new ExperimentInputError("Invalid experiment status.");
  const result = await prisma.keywordExperiment.updateMany({
    where: { id, appId },
    data: { status, conclusion },
  });
  if (!result.count) throw new ExperimentInputError("Experiment not found.");
  refresh();
}

async function createExperimentEventMutation(form: FormData) {
  const appId = text(form, "appId", 100);
  await ownedApp(appId);
  const kind = text(form, "kind", 20),
    title = text(form, "title", 120),
    notes = text(form, "notes");
  const startDate = day(form, "startDate"),
    endDate = day(form, "endDate");
  const cooldownDays =
    kind === "promotion" ? integer(form, "cooldownDays", 30) : 0;
  if (
    !["promotion", "metadata", "quiet"].includes(kind) ||
    !title ||
    startDate > endDate ||
    endDate > addDays(startDate, 365)
  )
    throw new ExperimentInputError(
      "Check the event type, title and date range.",
    );
  if (
    kind === "quiet" &&
    (form.get("confirmedQuiet") !== "on" || endDate > todayUTC())
  )
    throw new ExperimentInputError(
      "Only confirm past/present days when you did not post, run ads, or do other promotion.",
    );
  const url = text(form, "url", 2000);
  if (url && !/^https?:\/\//i.test(url))
    throw new ExperimentInputError("Use an http(s) link or leave it blank.");
  await prisma.experimentEvent.create({
    data: {
      appId,
      kind,
      title,
      notes,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      cooldownDays,
      url,
    },
  });
  refresh();
}

async function removeExperimentEventMutation(form: FormData) {
  const appId = text(form, "appId", 100);
  await ownedApp(appId);
  await prisma.experimentEvent.deleteMany({
    where: { appId, id: text(form, "id", 100) },
  });
  refresh();
}

async function importAcquisitionMutation(form: FormData) {
  const appId = text(form, "appId", 100);
  await ownedApp(appId);
  if (form.get("confirmedScope") !== "on")
    throw new ExperimentInputError(
      "Confirm the country, metric and date alignment before importing.",
    );
  const sourceNote = text(form, "sourceNote", 500);
  if (!sourceNote)
    throw new ExperimentInputError(
      "Describe the report/source and any Apple Ads activity.",
    );
  let rows;
  try {
    rows = parseAcquisitionCSV(text(form, "csv", 100000));
  } catch (error) {
    throw new ExperimentInputError((error as Error).message);
  }
  const existing = await prisma.acquisitionDay.count({
    where: { appId, date: { in: rows.map((r) => new Date(r.date)) } },
  });
  if (existing && form.get("overwrite") !== "on")
    throw new ExperimentInputError(
      `${existing} days already have data. Enable replace existing dates if this is a correction.`,
    );
  await prisma.$transaction(
    rows.map(({ date, ...counts }) =>
      prisma.acquisitionDay.upsert({
        where: { appId_date: { appId, date: new Date(date) } },
        create: { ...counts, sourceNote, appId, date: new Date(date) },
        update: { ...counts, sourceNote },
      }),
    ),
  );
  refresh();
}

// Expected validation errors must be returned explicitly: Next.js sanitizes
// thrown server errors in production. Never return raw Prisma/internal details.
async function execute(
  mutation: () => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await mutation();
    return { ok: true };
  } catch (error) {
    if (error instanceof ExperimentInputError)
      return { ok: false, error: error.message };
    console.error("Experiment mutation failed", error);
    return {
      ok: false,
      error: "Could not save the experiment workspace. Please try again.",
    };
  }
}
export async function createExperiment(form: FormData) {
  return execute(() => createExperimentMutation(form));
}
export async function saveExperimentOutcome(form: FormData) {
  return execute(() => saveExperimentOutcomeMutation(form));
}
export async function createExperimentEvent(form: FormData) {
  return execute(() => createExperimentEventMutation(form));
}
export async function removeExperimentEvent(form: FormData) {
  return execute(() => removeExperimentEventMutation(form));
}
export async function importAcquisition(form: FormData) {
  return execute(() => importAcquisitionMutation(form));
}

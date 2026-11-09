import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requireExperimentApp,
  validDay,
  addDays,
  dayContext,
  dailyRanks,
  experimentSummary,
  parseAcquisitionCSV,
} from "../src/lib/experiments.ts";

test("logged-out callers cannot resolve or mutate an experiment app", async () => {
  let queried = false;
  await assert.rejects(
    requireExperimentApp(
      "app",
      async () => null,
      async () => {
        queried = true;
        return {};
      },
    ),
    /Sign in/,
  );
  assert.equal(queried, false);
});
test("app ownership is resolved using the authenticated user, never client input", async () => {
  const calls = [];
  await assert.rejects(
    requireExperimentApp(
      "someone-elses-app",
      async () => ({ id: "owner" }),
      async (...args) => {
        calls.push(args);
        return null;
      },
    ),
    /access denied/,
  );
  assert.deepEqual(calls, [["someone-elses-app", "owner"]]);
});

const event = (kind, startDate, endDate, cooldownDays = 0) => ({
  id: kind,
  kind,
  startDate,
  endDate,
  cooldownDays,
  title: "test",
  url: "",
  notes: "",
});
const experiment = {
  id: "one",
  baselineStart: "2026-01-01",
  startDate: "2026-01-08",
  endDate: "2026-01-21",
  settleDays: 0,
};
const csvHeader =
  "date,searchDownloads,webReferrals,appReferrals,browseDownloads";

test("calendar validation rejects rolled-over dates", () => {
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2026-02-28"), true);
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
});
test("unlogged days are unknown, not quiet", () => {
  assert.equal(dayContext("2026-01-01", []), "unclassified");
});
test("promotion and cooldown override quiet declarations inclusively", () => {
  const events = [
    event("quiet", "2026-01-01", "2026-01-20"),
    event("promotion", "2026-01-04", "2026-01-05", 3),
  ];
  assert.equal(dayContext("2026-01-08", events), "promotion");
  assert.equal(dayContext("2026-01-09", events), "quiet");
});
test("daily ranks retain the latest check, including not-found null", () => {
  const data = dailyRanks([
    { date: "2026-01-01T15:00:00Z", position: null },
    { date: "2026-01-01T08:00:00Z", position: 5 },
  ]);
  assert.deepEqual(data, [{ date: "2026-01-01", position: null }]);
});
test("missing downloads do not turn into zero or qualify a comparison", () => {
  const summary = experimentSummary(
    experiment,
    {
      experiments: [],
      events: [event("quiet", "2026-01-01", "2026-01-21")],
      acquisition: [],
    },
    "2026-01-21",
  );
  assert.equal(summary.before.average, null);
  assert.equal(summary.change, null);
  assert.equal(summary.enough, false);
});
test("quiet comparison excludes promotion spikes and requires seven reported days", () => {
  const acquisition = Array.from({ length: 21 }, (_, i) => ({
    date: addDays("2026-01-01", i),
    searchDownloads: i === 7 ? 999 : i < 7 ? 4 : 8,
  }));
  const summary = experimentSummary(
    experiment,
    {
      experiments: [],
      events: [
        event("quiet", "2026-01-01", "2026-01-21"),
        event("promotion", "2026-01-08", "2026-01-08", 2),
      ],
      acquisition,
    },
    "2026-01-21",
  );
  assert.equal(summary.before.average, 4);
  assert.equal(summary.post.average, 8);
  assert.equal(summary.change, 100);
  assert.equal(summary.promotionDays, 3);
  assert.equal(summary.enough, true);
});
test("settling days and future days do not count toward evidence", () => {
  const data = {
    experiments: [],
    events: [event("quiet", "2026-01-01", "2026-01-21")],
    acquisition: [],
  };
  const result = experimentSummary(
    { ...experiment, settleDays: 3 },
    data,
    "2026-01-14",
  );
  assert.equal(result.post.totalDays, 4);
});
test("zero baselines never produce infinite percent uplift", () => {
  const acquisition = Array.from({ length: 21 }, (_, i) => ({
    date: addDays("2026-01-01", i),
    searchDownloads: i < 7 ? 0 : 5,
  }));
  assert.equal(
    experimentSummary(
      experiment,
      {
        experiments: [],
        events: [event("quiet", "2026-01-01", "2026-01-21")],
        acquisition,
      },
      "2026-01-21",
    ).change,
    null,
  );
});
test("CSV distinguishes blanks and measured zero and refuses duplicates or malformed values", () => {
  const rows = parseAcquisitionCSV(csvHeader + "\n2026-01-01,0,,2,3");
  assert.equal(rows[0].searchDownloads, 0);
  assert.equal(rows[0].webReferrals, null);
  assert.throws(
    () =>
      parseAcquisitionCSV(
        csvHeader + "\n2026-01-01,2,0,0,0\n2026-01-01,3,0,0,0",
      ),
    /duplicate/,
  );
  assert.throws(
    () => parseAcquisitionCSV(csvHeader + "\n2026-01-01,-1,0,0,0"),
    /Invalid count/,
  );
  assert.throws(
    () => parseAcquisitionCSV(csvHeader + "\n2026-02-30,1,0,0,0"),
    /Invalid/,
  );
  assert.throws(
    () => parseAcquisitionCSV(csvHeader + "\n2099-01-01,1,0,0,0"),
    /future/,
  );
});

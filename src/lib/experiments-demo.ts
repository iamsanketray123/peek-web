import { addDays, todayUTC, type ExperimentWorkspace } from "./experiments";

/** Synthetic data, used only by the explicitly labeled public demo. */
export function experimentDemo(): ExperimentWorkspace {
  const start = addDays(todayUTC(), -28);
  const date = (i: number) => addDays(start, i);
  return {
    app: {
      id: "demo",
      appleId: "6807894442",
      name: "Medo · example experiment",
      country: "us",
    },
    experiments: [
      {
        id: "example",
        name: "Lead with medication reminder",
        hypothesis:
          "A clearer keyword-led title will sustain search discovery after a launch post fades.",
        keywords: ["medication reminder", "pill tracker", "refill reminder"],
        before: "Medo: Medicine & Family Log",
        after: "Medo: Medication Reminder",
        baselineStart: date(0),
        startDate: date(10),
        endDate: date(28),
        settleDays: 3,
        status: "running",
        conclusion: "",
      },
    ],
    events: [
      {
        id: "quiet",
        kind: "quiet",
        title: "Quiet days · promotion exclusions apply",
        startDate: date(0),
        endDate: date(28),
        cooldownDays: 0,
        url: "",
        notes: "Synthetic quiet-period log for demonstration.",
      },
      {
        id: "reddit",
        kind: "promotion",
        title: "Reddit launch post",
        startDate: date(10),
        endDate: date(12),
        cooldownDays: 3,
        url: "",
        notes:
          "Exclude the promotion and 3-day cooldown from the quiet comparison.",
      },
    ],
    acquisition: Array.from({ length: 29 }, (_, i) => ({
      date: date(i),
      searchDownloads:
        i >= 10 && i <= 15
          ? 30 - (i - 10) * 3
          : i < 10
            ? 4 + (i % 3)
            : 8 + (i % 3),
      webReferrals: i >= 10 && i <= 15 ? 36 - (i - 10) * 6 : i % 2,
      appReferrals: i >= 10 && i <= 13 ? 7 : 1,
      browseDownloads: 2,
      sourceNote: "SYNTHETIC DEMO — not real Medo metrics",
    })),
    keywords: ["medication reminder", "pill tracker", "refill reminder"].map(
      (term, j) => ({
        id: term,
        term,
        history: Array.from({ length: 29 }, (_, i) => ({
          date: date(i) + "T08:00:00Z",
          position:
            i === 6
              ? null
              : Math.max(
                  5,
                  95 +
                    j * 22 -
                    (i >= 10 && i <= 15 ? 65 : i > 15 ? 23 : 0) +
                    (i % 4) * 3,
                ),
        })),
      }),
    ),
  };
}

// Seed terms are research candidates, not claims of demand or opportunity.
export const profiles = {
  medo: {
    appleId: "6807894442", aliases: ["dosey", "medo"], bundleId: "rayki.Dosey",
    name: "Medo Medicine Tracker Reminder", country: "us",
    keywords: ["medication reminder", "pill reminder", "medicine tracker", "pill tracker", "refill reminder", "family medication"],
  },
  tether: {
    appleId: "6777777931", aliases: ["tether"], bundleId: "rayki.Tether",
    name: "Tether: ADHD Planner & Focus", country: "us",
    keywords: ["adhd planner", "daily planner", "visual planner", "time blocking", "adhd focus", "task planner"],
  },
};

export function resolveApp(value) {
  const input = value.trim().toLowerCase();
  const profile = Object.values(profiles).find((p) => p.aliases.includes(input));
  if (profile) return profile;
  const id = /^\d+$/.test(input) ? input : input.match(/\bid(\d+)\b/)?.[1];
  if (!id) throw new Error("Use medo, dosey, tether, a numeric App Store ID, or an App Store URL.");
  return { appleId: id, keywords: [], country: "us" };
}

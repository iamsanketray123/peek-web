/** Compact number: 1234 -> "1.2K", 2_300_000 -> "2.3M". */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

/** Download/day estimate range, e.g. "2–9". */
export function dlRange(low: number, high: number): string {
  const fmt = (x: number) => (x >= 10 ? Math.round(x).toString() : x < 1 ? x.toFixed(1) : x.toFixed(1));
  return `${fmt(low)}–${fmt(high)}`;
}

export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "us", name: "United States", flag: "🇺🇸" },
  { code: "gb", name: "United Kingdom", flag: "🇬🇧" },
  { code: "ca", name: "Canada", flag: "🇨🇦" },
  { code: "au", name: "Australia", flag: "🇦🇺" },
  { code: "in", name: "India", flag: "🇮🇳" },
  { code: "de", name: "Germany", flag: "🇩🇪" },
  { code: "fr", name: "France", flag: "🇫🇷" },
  { code: "es", name: "Spain", flag: "🇪🇸" },
  { code: "it", name: "Italy", flag: "🇮🇹" },
  { code: "br", name: "Brazil", flag: "🇧🇷" },
  { code: "mx", name: "Mexico", flag: "🇲🇽" },
  { code: "jp", name: "Japan", flag: "🇯🇵" },
  { code: "kr", name: "South Korea", flag: "🇰🇷" },
];

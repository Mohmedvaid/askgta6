const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Short, absolute past tense. No "about", no "ago" flourishes beyond the one word. */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value);
  const elapsed = now.getTime() - then.getTime();

  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed < 365 * DAY) return `${Math.floor(elapsed / WEEK)}w ago`;
  return `${Math.floor(elapsed / (365 * DAY))}y ago`;
}

export function monthAndYear(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

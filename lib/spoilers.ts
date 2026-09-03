/**
 * The spoiler gate. Every read path that returns a post or a reply runs through
 * applySpoilerGate on the server, so hidden content never leaves the machine.
 */

export const SPOILER_LEVEL_COUNT = 8;

export type SpoilerLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SpoilerLevelInfo = {
  level: SpoilerLevel;
  label: string;
  description: string;
};

// Labels get renamed once the real story structure is public. The count stays at 8.
export const SPOILER_LEVELS: readonly SpoilerLevelInfo[] = [
  { level: 0, label: "Haven't played", description: "Trailers and announced facts only. Safe for everyone." },
  { level: 1, label: "Chapter 1", description: "The opening hours and the first named jobs." },
  { level: 2, label: "Chapter 2", description: "Through the second act of the story." },
  { level: 3, label: "Chapter 3", description: "Through the third act of the story." },
  { level: 4, label: "Chapter 4", description: "Through the fourth act of the story." },
  { level: 5, label: "Chapter 5", description: "Through the fifth act of the story." },
  { level: 6, label: "Chapter 6", description: "Through the final run up to the ending." },
  { level: 7, label: "Finished", description: "Endings, post credits, everything." },
] as const;

export function spoilerLevelInfo(level: number): SpoilerLevelInfo {
  return SPOILER_LEVELS[clampProgress(level)]!;
}

export function clampProgress(value: unknown): SpoilerLevel {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.trunc(parsed);
  if (rounded < 0) return 0;
  if (rounded > SPOILER_LEVEL_COUNT - 1) return (SPOILER_LEVEL_COUNT - 1) as SpoilerLevel;
  return rounded as SpoilerLevel;
}

/** The shape the gate needs. Anything else on the record is passed through untouched. */
export type Gateable = { spoiler_level: number; body: string; title?: string };

export type Gated<T extends Gateable> =
  | (T & { hidden: false })
  | (Omit<T, "title" | "body"> & { hidden: true });

const REDACTED_KEYS: readonly string[] = ["title", "body"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Drops every title and body at any depth. Going deeper than the top level is
 * deliberate: an embedded row (a reply's parent post, say) is exactly how a
 * headline sneaks into the payload of something the reader is not allowed to see.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isPlainObject(value)) return value;

  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (REDACTED_KEYS.includes(key)) continue;
    copy[key] = redact(nested);
  }
  return copy;
}

/**
 * Returns the item as is when the viewer has reached its level, otherwise a
 * redacted copy with no title, no body, and no hint of their length.
 */
export function applySpoilerGate<T extends Gateable>(item: T, viewerProgress: number): Gated<T> {
  if (item.spoiler_level <= clampProgress(viewerProgress)) {
    return { ...item, hidden: false };
  }

  return { ...(redact(item) as Record<string, unknown>), hidden: true } as Gated<T>;
}

export function applySpoilerGateAll<T extends Gateable>(items: readonly T[], viewerProgress: number): Gated<T>[] {
  return items.map((item) => applySpoilerGate(item, viewerProgress));
}

/** A revealed item is shown for this session only. Nothing is written down. */
export function canReveal(item: { spoiler_level: number }): boolean {
  return item.spoiler_level >= 0 && item.spoiler_level < SPOILER_LEVEL_COUNT;
}

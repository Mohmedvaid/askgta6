const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const PLACEHOLDER_PREFIX = "player_";

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export function isPlaceholderUsername(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX);
}

/** Best effort cleanup of what a person typed, so the inline error is rare. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

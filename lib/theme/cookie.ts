export const THEME_COOKIE = "askgta6-theme";

export type ThemeName = "dark" | "light";

export function resolveTheme(value: string | undefined): ThemeName {
  return value === "light" ? "light" : "dark";
}

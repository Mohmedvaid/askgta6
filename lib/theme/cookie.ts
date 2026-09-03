export const THEME_COOKIE = "askgta6-theme";

export type ThemeName = "dark" | "light";

export function resolveTheme(value: string | undefined): ThemeName {
  return value === "light" ? "light" : "dark";
}

/**
 * Applies the theme before first paint, from the browser's own cookie jar.
 *
 * The server used to read the cookie in the root layout, which made every route
 * in the app dynamic for the sake of one attribute. This runs as the first thing
 * in the body instead, so the landing page can be prerendered and a reader on
 * the light theme still never sees a dark frame.
 */
export const THEME_BOOTSTRAP = `try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);document.documentElement.dataset.theme=m&&decodeURIComponent(m[1])==="light"?"light":"dark"}catch(e){}`;

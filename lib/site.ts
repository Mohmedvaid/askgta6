/**
 * The public origin, baked in at build time. Every absolute URL the app emits,
 * for auth redirects, feeds, sitemaps, and structured data, comes from here so
 * there is one place to be wrong.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

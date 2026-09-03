import type { MetadataRoute } from "next";
import { NEVER_INDEXED_SOURCES, indexingEnabled } from "@/lib/indexing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Disallows everything while indexing is off. Even when on, the private routes stay out. */
export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Next path params become the wildcard crawlers understand: /g/:slug/new -> /g/*/new
        disallow: NEVER_INDEXED_SOURCES.map((source) => source.replace(/:[a-z]+\*?/g, "*")),
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

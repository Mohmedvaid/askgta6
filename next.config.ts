import type { NextConfig } from "next";
import { NEVER_INDEXED_SOURCES, indexingEnabled } from "./lib/indexing";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts and, in dev, uses eval for HMR.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:" + (supabaseOrigin ? ` ${supabaseOrigin}` : ""),
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const NOINDEX_HEADER = { key: "X-Robots-Tag", value: "noindex, nofollow" };

const supabaseHost = supabaseOrigin ? new URL(supabaseOrigin).hostname : "";

const nextConfig: NextConfig = {
  images: {
    // Avatars are the only remote image the app renders. Anything else is a bug.
    remotePatterns: supabaseHost
      ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },

  async headers() {
    return [
      // Belt and braces: while indexing is off the whole site carries the header,
      // and the private routes carry it even after the flag is turned on.
      ...(indexingEnabled() ? [] : [{ source: "/:path*", headers: [NOINDEX_HEADER] }]),
      ...NEVER_INDEXED_SOURCES.map((source) => ({ source, headers: [NOINDEX_HEADER] })),
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

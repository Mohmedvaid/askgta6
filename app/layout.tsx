import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { fontVariables } from "@/lib/theme/fonts";
import { THEME_BOOTSTRAP } from "@/lib/theme/cookie";
import { NOINDEX, indexingEnabled } from "@/lib/indexing";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "AskGTA6, the spoiler safe GTA VI community",
    template: "%s, AskGTA6",
  },
  description:
    "Ask questions, trade tips, and argue about Grand Theft Auto VI without walking into a spoiler. Set how far you have played and the site hides the rest.",
  icons: { icon: "/icon.svg" },
  // The feed is only advertised when the site is asking to be found at all.
  alternates: indexingEnabled()
    ? { types: { "application/rss+xml": [{ url: "/feed.xml", title: "AskGTA6" }] } }
    : undefined,
  // Noindex is the default for the whole app. The handful of pages that may be
  // indexed override this, and only when NEXT_PUBLIC_INDEXING is on.
  robots: NOINDEX,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Dark is the served default, which matches :root in tokens.css. The bootstrap
    // script below switches a light reader over before anything is painted.
    <html lang="en" data-theme="dark" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

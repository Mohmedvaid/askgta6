import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fontVariables } from "@/lib/theme/fonts";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme/cookie";
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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The cookie is the theme provider. Setting it on <html> here means no flash on first paint.
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme} className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

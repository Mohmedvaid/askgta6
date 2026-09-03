import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { SpoilerDemo } from "@/components/SpoilerDemo";
import { PostCard } from "@/components/post/PostCard";
import { listPosts } from "@/lib/queries/posts";
import { getViewer } from "@/lib/viewer";
import { robotsFor } from "@/lib/indexing";

export const metadata: Metadata = { robots: robotsFor(true) };

export default async function LandingPage() {
  const viewer = await getViewer();
  if (viewer) redirect("/feed");

  const latest = await listPosts({ tab: "latest" }, 0);
  const safe = latest.items.filter((post) => !post.hidden).slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-20">
      <header className="flex items-center justify-between gap-4">
        <Wordmark className="h-7 w-auto text-text-primary" />
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in" className="text-sm font-medium text-text-secondary">
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
          >
            Sign up
          </Link>
        </div>
      </header>

      <section className="mt-20 max-w-3xl md:mt-28">
        <h1 className="font-display text-5xl leading-[1.05] font-bold text-text-primary md:text-7xl">
          Talk about GTA VI. Seal the parts you have not reached.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-text-secondary">
          The forum reads in full by default. Turn on the spoiler shield, say how far you have played, and every body
          past that point waits. Titles always stay visible.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/auth/sign-up"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-text"
          >
            Create an account
          </Link>
          <Link
            href="/feed"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary"
          >
            Read the feed
          </Link>
        </div>
      </section>

      <section className="mt-20 md:mt-28">
        <h2 className="font-display text-2xl font-semibold text-text-primary">The shield, off and on</h2>
        <p className="mt-2 max-w-xl text-sm text-text-secondary">
          The same post both ways. The pill in the header is the only switch, and it never touches your chapter.
        </p>
        <div className="mt-6">
          <SpoilerDemo />
        </div>
      </section>

      {safe.length > 0 ? (
        <section className="mt-20 md:mt-28">
          <h2 className="font-display text-2xl font-semibold text-text-primary">Safe to read right now</h2>
          <p className="mt-2 text-sm text-text-secondary">Trailer level threads, open to everyone.</p>
          <div className="mt-6">
            {safe.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="mt-24 border-t border-border pt-8 text-sm text-text-muted">
        <p>
          AskGTA6 is a fan made community. It is not affiliated with, endorsed by, or connected to Rockstar Games or
          Take-Two Interactive. Grand Theft Auto VI releases November 19, 2026 on PS5 and Xbox Series X and S.
        </p>
      </footer>
    </div>
  );
}

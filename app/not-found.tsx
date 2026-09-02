import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 text-center">
      <Wordmark className="mx-auto h-6 w-auto text-text-primary" />
      <h1 className="mt-10 font-display text-4xl font-bold text-text-primary">Nothing at this address</h1>
      <p className="mt-3 text-sm text-text-secondary">
        The page moved, the post was deleted, or the link was mistyped.
      </p>
      <Link
        href="/feed"
        className="mx-auto mt-8 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
      >
        Go to the feed
      </Link>
    </div>
  );
}

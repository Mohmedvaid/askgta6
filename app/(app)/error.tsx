"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-6 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-text-primary">Something broke on our side</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
        The page failed to load. Try again, and if it keeps happening come back in a few minutes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
      >
        Try again
      </button>
    </div>
  );
}

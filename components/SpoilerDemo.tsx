import { applySpoilerGate } from "@/lib/spoilers";
import { SpoilerPlaceholder } from "./post/SpoilerPlaceholder";
import { SpoilerBadge } from "./SpoilerBadge";

const SAMPLE = {
  id: "sample",
  spoiler_level: 4,
  title: "Best approach to the fourth act job",
  body: "Placeholder for a mid game answer that a reader who has not got there should not meet on the front page.",
};

/**
 * The landing demo. One post, rendered twice through the real gate: once with the
 * shield off, which is the default, and once with it on at Haven't played. No
 * state, no data, no account. It is static so the landing page can be too.
 */
export function SpoilerDemo() {
  const open = applySpoilerGate(SAMPLE, "none");
  const sealed = applySpoilerGate(SAMPLE, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel caption="Shield off" note="The default. Everything reads in full.">
        <SpoilerBadge level={open.spoiler_level} tone="quiet" />
        <h3 className="mt-3 font-display text-lg font-semibold text-text-primary">{open.title}</h3>
        <p className="mt-2 text-sm text-text-secondary">{open.hidden ? null : open.body}</p>
      </Panel>

      <Panel caption="Shield on, Haven't played" note="Title stays. Body waits.">
        <SpoilerBadge level={sealed.spoiler_level} tone="loud" />
        <h3 className="mt-3 font-display text-lg font-semibold text-text-primary">{sealed.title}</h3>
        <div className="mt-2">
          <SpoilerPlaceholder variant="card" level={sealed.spoiler_level} />
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  caption,
  note,
  children,
}: {
  caption: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary">{caption}</span>
        <span className="text-xs text-text-muted">{note}</span>
      </div>
      <div className="mt-4 rounded-md border border-border bg-surface-0 p-5">{children}</div>
    </div>
  );
}

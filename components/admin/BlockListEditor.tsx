"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { editBlockList } from "@/actions/admin";

export type BlockEntry = { id: string; value: string; note: string | null };

/**
 * One list, editable in place. Adding a domain accepts a whole URL and stores the
 * host, because pasting the spam link is what a moderator will actually do.
 */
export function BlockListEditor({
  list,
  title,
  hint,
  entries,
}: {
  list: "domain" | "phrase";
  title: string;
  hint: string;
  entries: readonly BlockEntry[];
}) {
  const [state, formAction] = useActionState(editBlockList, null);

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <h3 className="font-display font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>

      <form action={formAction} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name="action" value="add" />
        <label htmlFor={`add-${list}`} className="sr-only">
          Add to {title}
        </label>
        <input
          id={`add-${list}`}
          name="value"
          required
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-primary"
        />
        <input
          name="note"
          placeholder="note, optional"
          maxLength={120}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        <SubmitButton label="Add" pendingLabel="Adding" />
      </form>

      <FieldError message={state && !state.ok ? state.error : null} />

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nothing on this list.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="font-mono text-sm text-text-primary">{entry.value}</span>
              {entry.note ? <span className="text-xs text-text-muted">{entry.note}</span> : null}
              <form action={formAction}>
                <input type="hidden" name="list" value={list} />
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="value" value={entry.value} />
                <SubmitButton label="Remove" pendingLabel="Removing" tone="quiet" />
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

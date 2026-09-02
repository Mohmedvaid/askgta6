"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { createGroup } from "@/actions/groups";

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

export function GroupComposer() {
  const [state, formAction] = useActionState(createGroup, null);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="name" className="text-sm font-semibold text-text-primary">
          Name
        </label>
        <input id="name" name="name" required maxLength={60} className={`mt-2 ${inputClass}`} />
      </div>

      <div>
        <label htmlFor="description" className="text-sm font-semibold text-text-primary">
          Description
        </label>
        <textarea id="description" name="description" rows={3} maxLength={500} className={`mt-2 ${inputClass}`} />
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-text-primary">Visibility</legend>
        <div className="mt-3 flex gap-2">
          {[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" },
          ].map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary"
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                defaultChecked={option.value === "public"}
                className="accent-accent"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <FieldError message={state && !state.ok ? state.error : null} />
      <SubmitButton label="Create group" pendingLabel="Creating" />
    </form>
  );
}

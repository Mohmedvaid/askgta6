"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { submitReport } from "@/actions/reports";

const REASONS = [
  { value: "leak", label: "Leaked content" },
  { value: "wrong_spoiler_level", label: "Wrong spoiler level" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];

export function ReportDialog({ targetType, targetId }: { targetType: "post" | "reply"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(submitReport, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-text-muted">
        Report
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-md border border-border bg-surface-1 p-4">
      {state?.ok ? (
        <p className="text-sm text-success">Report filed. A moderator will look at it.</p>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />

          <label htmlFor="report-reason" className="block text-sm font-semibold text-text-primary">
            Why are you reporting this
          </label>
          <select
            id="report-reason"
            name="reason"
            className="w-full rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary"
          >
            {REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>

          <textarea
            name="note"
            rows={2}
            maxLength={500}
            placeholder="Add a note (optional)"
            className="w-full rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />

          <FieldError message={state && !state.ok ? state.error : null} />

          <div className="flex gap-2">
            <SubmitButton label="Send report" pendingLabel="Sending" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

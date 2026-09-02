"use client";

import { useActionState } from "react";
import { SubmitButton } from "./form/SubmitButton";
import { FieldError } from "./form/FieldError";
import { moderate } from "@/actions/moderation";

export function ModerationRow({ targetType, targetId }: { targetType: "post" | "reply"; targetId: string }) {
  const [state, formAction] = useActionState(moderate, null);

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["hide", "unhide", "delete"] as const).map((action) => (
          <form key={action} action={formAction}>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="action" value={action} />
            <SubmitButton label={action} pendingLabel="Working" tone={action === "delete" ? "danger" : "quiet"} />
          </form>
        ))}
      </div>
      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <p className="text-sm text-success">Done.</p> : null}
    </div>
  );
}

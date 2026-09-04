"use client";

import { useActionState, useState } from "react";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { Honeypot } from "./Honeypot";
import { Turnstile } from "./Turnstile";
import { createReply } from "@/actions/replies";

type ReplyComposerProps = {
  postId: string;
  defaultSpoilerLevel: number;
  /** The canonical path of the thread, so a new reply revalidates the page in view. */
  path: string;
};

export function ReplyComposer({ postId, defaultSpoilerLevel, path }: ReplyComposerProps) {
  const [state, formAction] = useActionState(createReply, null);
  // React resets an uncontrolled form on submit, which would throw away the draft
  // when the server rejects it. Holding the body here keeps a refused reply on screen.
  const [body, setBody] = useState("");
  const [handled, setHandled] = useState(state);

  if (state !== handled) {
    setHandled(state);
    if (state?.ok) setBody("");
  }

  return (
    <form action={formAction} className="relative space-y-5">
      <Honeypot />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="path" value={path} />

      <div>
        <label htmlFor="reply-body" className="text-sm font-semibold text-text-primary">
          Your reply
        </label>
        <textarea
          id="reply-body"
          name="body"
          rows={6}
          maxLength={10000}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Answer the question, or add what you know."
          className="mt-2 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <SpoilerLevelControl
        name="spoilerLevel"
        defaultValue={defaultSpoilerLevel}
        label="Spoiler level for this reply"
        hint="Replies are gated on their own level, so a level 3 answer stays hidden on a level 0 question."
      />

      <Turnstile />

      <FieldError message={state && !state.ok ? state.error : null} />
      <SubmitButton label="Post reply" pendingLabel="Posting" />
    </form>
  );
}

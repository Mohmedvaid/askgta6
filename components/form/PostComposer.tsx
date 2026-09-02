"use client";

import { useActionState } from "react";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { TOPICS, TOPIC_LABELS } from "@/lib/topics";
import type { ActionResult } from "@/lib/validation";

type PostComposerDefaults = {
  postId?: string;
  title?: string;
  body?: string;
  topic?: string;
  kind?: string;
  spoilerLevel: number;
  groupId?: string | null;
};

type PostComposerProps = {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults: PostComposerDefaults;
  submitLabel: string;
};

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

export function PostComposer({ action, defaults, submitLabel }: PostComposerProps) {
  const [state, formAction] = useActionState(action, null);
  const editing = Boolean(defaults.postId);

  return (
    <form action={formAction} className="space-y-6">
      {defaults.postId ? <input type="hidden" name="postId" value={defaults.postId} /> : null}
      {defaults.groupId ? <input type="hidden" name="groupId" value={defaults.groupId} /> : null}

      {editing ? null : (
        <fieldset>
          <legend className="text-sm font-semibold text-text-primary">What are you posting</legend>
          <div className="mt-3 flex gap-2">
            {["question", "discussion"].map((kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary"
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  defaultChecked={(defaults.kind ?? "question") === kind}
                  className="accent-accent"
                />
                {kind === "question" ? "Question" : "Discussion"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="title" className="text-sm font-semibold text-text-primary">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={defaults.title}
          maxLength={140}
          required
          placeholder="Ask it the way you would say it out loud"
          className={`mt-2 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="body" className="text-sm font-semibold text-text-primary">
          Body
        </label>
        <textarea
          id="body"
          name="body"
          defaultValue={defaults.body}
          rows={10}
          maxLength={10000}
          required
          placeholder="Bold, italic, links, code, and lists are supported."
          className={`mt-2 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="topic" className="text-sm font-semibold text-text-primary">
          Topic
        </label>
        <select
          id="topic"
          name="topic"
          defaultValue={defaults.topic ?? "general"}
          className={`mt-2 ${inputClass}`}
        >
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {TOPIC_LABELS[topic]}
            </option>
          ))}
        </select>
      </div>

      <SpoilerLevelControl
        name="spoilerLevel"
        defaultValue={defaults.spoilerLevel}
        label="Spoiler level"
        hint="Not sure? Tag it higher. Hiding a safe post is harmless. Spoiling someone is not."
      />

      <FieldError message={state && !state.ok ? state.error : null} />
      <SubmitButton label={submitLabel} pendingLabel="Saving" />
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { Honeypot } from "./Honeypot";
import { Turnstile } from "./Turnstile";
import { TOPICS, TOPIC_LABELS } from "@/lib/topics";
import type { ActionResult } from "@/lib/validation";
import { track } from "@/lib/analytics";

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
  // React resets an uncontrolled form on submit. A rejected post would lose everything
  // the person wrote, so the text fields are held here instead.
  const [title, setTitle] = useState(defaults.title ?? "");
  const [body, setBody] = useState(defaults.body ?? "");
  const [topic, setTopic] = useState(defaults.topic ?? "general");
  const [spoilerLevel, setSpoilerLevel] = useState(defaults.spoilerLevel);
  const [kind, setKind] = useState(defaults.kind ?? "question");
  const editing = Boolean(defaults.postId);

  // A successful create redirects, so the event fires from the submit handler.
  // Nothing about the title or the body is sent, only the shape of the post.
  const announce = () => {
    if (editing) return;
    track("post_created", {
      kind: kind === "discussion" ? "discussion" : "question",
      topic,
      spoiler_level: spoilerLevel,
      in_group: Boolean(defaults.groupId),
    });
  };

  return (
    <form action={formAction} onSubmit={announce} className="relative space-y-6">
      <Honeypot />
      {defaults.postId ? <input type="hidden" name="postId" value={defaults.postId} /> : null}
      {defaults.groupId ? <input type="hidden" name="groupId" value={defaults.groupId} /> : null}

      {editing ? null : (
        <fieldset>
          <legend className="text-sm font-semibold text-text-primary">What are you posting</legend>
          <div className="mt-3 flex gap-2">
            {["question", "discussion"].map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary"
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  defaultChecked={(defaults.kind ?? "question") === option}
                  onChange={() => setKind(option)}
                  className="accent-accent"
                />
                {option === "question" ? "Question" : "Discussion"}
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
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          required
          placeholder="Ask it the way you would say it out loud"
          className={`mt-2 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-text-muted">
          Keep spoilers out of titles. Titles are always visible.
        </p>
      </div>

      <div>
        <label htmlFor="body" className="text-sm font-semibold text-text-primary">
          Body
        </label>
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
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
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
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
        onChange={setSpoilerLevel}
        label="Spoiler level"
        hint="Not sure? Tag it higher. Hiding a safe post is harmless. Spoiling someone is not."
      />

      <Turnstile />

      <FieldError message={state && !state.ok ? state.error : null} />
      <SubmitButton label={submitLabel} pendingLabel="Saving" />
    </form>
  );
}

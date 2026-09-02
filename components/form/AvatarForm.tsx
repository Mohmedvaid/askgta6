"use client";

import { useActionState } from "react";
import { Avatar } from "../Avatar";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { uploadAvatar } from "@/actions/profile";

export function AvatarForm({ username, url }: { username: string; url: string | null }) {
  const [state, formAction] = useActionState(uploadAvatar, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-5">
      <Avatar username={username} url={url} size={64} />

      <div className="space-y-3">
        <label htmlFor="avatar" className="sr-only">
          Avatar image
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-sm text-text-secondary"
        />
        <p className="text-xs text-text-muted">PNG, JPEG, WebP, or GIF, up to 2 MB.</p>
        <FieldError message={state && !state.ok ? state.error : null} />
        {state?.ok ? <p className="text-sm text-success">Avatar updated.</p> : null}
        <SubmitButton label="Upload" pendingLabel="Uploading" tone="quiet" />
      </div>
    </form>
  );
}

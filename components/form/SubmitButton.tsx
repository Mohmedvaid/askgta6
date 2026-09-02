"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  tone?: "accent" | "quiet" | "danger";
};

export function SubmitButton({ label, pendingLabel, tone = "accent" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "accent"
      ? "bg-accent text-accent-text"
      : tone === "danger"
        ? "border border-border text-danger"
        : "border border-border text-text-secondary";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60 ${toneClass}`}
    >
      {pending ? (pendingLabel ?? label) : label}
    </button>
  );
}

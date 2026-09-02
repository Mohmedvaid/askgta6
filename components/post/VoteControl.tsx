"use client";

import { useState, useTransition } from "react";
import { castVote } from "@/actions/votes";

type VoteControlProps = {
  targetType: "post" | "reply";
  targetId: string;
  count: number;
  myVote: number;
  layout?: "column" | "row";
};

export function VoteControl({ targetType, targetId, count, myVote, layout = "column" }: VoteControlProps) {
  const [total, setTotal] = useState(count);
  const [mine, setMine] = useState(myVote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (value: number) => {
    const next = mine === value ? 0 : value;
    startTransition(async () => {
      const result = await castVote({ targetType, targetId, value: next });
      if (result.ok) {
        setTotal(result.data);
        setMine(next);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const buttonClass = (active: boolean) =>
    `rounded-md px-2 py-1 text-sm leading-none ${active ? "bg-accent-bg text-accent" : "text-text-muted"}`;

  return (
    <div className={layout === "column" ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}>
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={mine === 1}
        disabled={pending}
        onClick={() => send(1)}
        className={buttonClass(mine === 1)}
      >
        &#9650;
      </button>
      <span className="min-w-6 text-center text-sm font-semibold text-text-primary tabular-nums">{total}</span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={mine === -1}
        disabled={pending}
        onClick={() => send(-1)}
        className={buttonClass(mine === -1)}
      >
        &#9660;
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </div>
  );
}

"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-xs text-text-secondary">
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}${value}`);
          setCopied(true);
        }}
        className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-text-secondary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

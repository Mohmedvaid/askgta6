"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { signOut } from "@/app/auth/actions";

type UserMenuProps = {
  username: string;
  avatarUrl: string | null;
};

/** The signed in reader's menu. Profile, settings, and the way out. */
export function UserMenu({ username, avatarUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const itemClass = "block w-full rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-2";

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Account: ${username}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
        className="flex items-center gap-2 rounded-md text-sm text-text-secondary"
      >
        <Avatar username={username} url={avatarUrl} size={28} />
        <span className="hidden sm:inline">{username}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-border bg-surface-1 p-1.5 shadow-raised"
        >
          <Link role="menuitem" href={`/u/${username}`} onClick={() => setOpen(false)} className={itemClass}>
            Your profile
          </Link>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={itemClass}>
            Settings
          </Link>

          <form action={signOut} className="mt-1 border-t border-border pt-1">
            <button type="submit" role="menuitem" className={itemClass}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

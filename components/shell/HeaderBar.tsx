import Link from "next/link";
import { Wordmark } from "../brand/Wordmark";
import { Avatar } from "../Avatar";
import { SearchBox } from "./SearchBox";
import { ShieldPill } from "./ShieldPill";

type HeaderBarProps = {
  username: string | null;
  avatarUrl: string | null;
  shieldEnabled: boolean;
  shieldProgress: number;
  search?: string;
};

export function HeaderBar({ username, avatarUrl, shieldEnabled, shieldProgress, search }: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-surface-0/95 px-4 py-3 backdrop-blur md:px-8">
      <Link href="/feed" className="text-text-primary lg:hidden">
        <Wordmark className="h-5 w-auto" />
      </Link>

      <div className="ml-auto flex flex-1 justify-end gap-3 md:ml-0 md:justify-start">
        <SearchBox defaultValue={search} />
      </div>

      <ShieldPill enabled={shieldEnabled} progress={shieldProgress} />

      {username ? (
        <Link href={`/u/${username}`} className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
          <Avatar username={username} url={avatarUrl} size={28} />
          <span className="hidden sm:inline">{username}</span>
        </Link>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/auth/sign-in" className="text-sm font-medium text-text-secondary">
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text"
          >
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
}

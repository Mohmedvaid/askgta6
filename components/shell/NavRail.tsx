import Link from "next/link";
import { Wordmark } from "../brand/Wordmark";
import type { GroupRow } from "@/lib/queries/groups";

type NavRailProps = {
  groups: GroupRow[];
  signedIn: boolean;
};

const PRIMARY = [
  { href: "/feed", label: "Feed" },
  { href: "/g", label: "Groups" },
  { href: "/new", label: "New post" },
];

export function NavRail({ groups, signedIn }: NavRailProps) {
  return (
    <nav
      aria-label="Primary"
      className="hidden shrink-0 flex-col gap-8 border-r border-border px-5 py-6 lg:flex"
      style={{ width: "var(--rail-width)" }}
    >
      <Link href={signedIn ? "/feed" : "/"} className="block text-text-primary">
        <Wordmark className="h-6 w-auto" />
      </Link>

      <ul className="flex flex-col gap-1">
        {PRIMARY.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-1 hover:text-text-primary"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {signedIn ? (
        <div>
          <h2 className="px-3 text-xs font-semibold tracking-widest text-text-muted uppercase">Your groups</h2>
          {groups.length === 0 ? (
            <p className="mt-3 px-3 text-sm text-text-muted">None yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/g/${group.slug}`}
                    className="block truncate rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary"
                  >
                    {group.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <p className="mt-auto px-3 text-xs leading-relaxed text-text-muted">
        Fan made and unofficial. Not affiliated with Rockstar Games.
      </p>
    </nav>
  );
}

import type { ReactNode } from "react";
import { NavRail } from "./NavRail";
import { BottomBar } from "./BottomBar";
import { HeaderBar } from "./HeaderBar";
import type { GroupRow } from "@/lib/queries/groups";

type AppShellProps = {
  children: ReactNode;
  context?: ReactNode;
  groups: GroupRow[];
  isAdmin: boolean;
  username: string | null;
  avatarUrl: string | null;
  shield: { enabled: boolean; progress: number };
};

/**
 * Three regions on desktop: rail, content, context.
 * The context column drops under the content on tablet, the rail becomes a bottom bar on mobile.
 */
export function AppShell({ children, context, groups, username, avatarUrl, shield, isAdmin }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <NavRail groups={groups} signedIn={Boolean(username)} isAdmin={isAdmin} />

      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar
          username={username}
          avatarUrl={avatarUrl}
          shieldEnabled={shield.enabled}
          shieldProgress={shield.progress}
        />

        <div className="mx-auto flex w-full max-w-[86rem] flex-1 flex-col gap-10 px-4 pt-8 pb-24 md:px-8 xl:flex-row xl:gap-14 xl:pb-16">
          <main className="min-w-0 flex-1 xl:max-w-[var(--content-max)]">
            {children}
          </main>

          {context ? (
            <aside
              className="order-last w-full shrink-0 xl:order-none xl:w-[var(--context-width)]"
              aria-label="Context"
            >
              {context}
            </aside>
          ) : null}
        </div>
      </div>

      <BottomBar />
    </div>
  );
}

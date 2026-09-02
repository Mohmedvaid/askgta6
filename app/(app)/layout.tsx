import { AppShell } from "@/components/shell/AppShell";
import { ProgressPanel } from "@/components/shell/ProgressPanel";
import { SignedOutPanel } from "@/components/shell/SignedOutPanel";
import { getViewer } from "@/lib/viewer";
import { listMyGroups } from "@/lib/queries/groups";
import { avatarUrl } from "@/lib/queries/profiles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const groups = viewer ? await listMyGroups(viewer.userId) : [];
  const url = await avatarUrl(viewer?.avatarPath);

  return (
    <AppShell
      groups={groups}
      username={viewer?.username ?? null}
      avatarUrl={url}
      context={
        <div className="space-y-6">
          {viewer ? <ProgressPanel progress={viewer.progress} /> : <SignedOutPanel />}
          <section className="rounded-lg border border-border bg-surface-1 p-5">
            <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">
              How the gate works
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
              Every post and every reply carries the chapter it belongs to. Anything past where you have played is
              held back until you ask for it, and revealing one thing never moves your progress.
            </p>
          </section>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

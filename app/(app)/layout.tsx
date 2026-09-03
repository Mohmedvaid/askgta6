import { AppShell } from "@/components/shell/AppShell";
import { SignedOutPanel } from "@/components/shell/SignedOutPanel";
import { getShieldState, getViewer } from "@/lib/viewer";
import { listMyGroups } from "@/lib/queries/groups";
import { avatarUrl } from "@/lib/queries/profiles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const shield = await getShieldState();
  const groups = viewer ? await listMyGroups(viewer.userId) : [];
  const url = await avatarUrl(viewer?.avatarPath);

  return (
    <AppShell
      groups={groups}
      username={viewer?.username ?? null}
      avatarUrl={url}
      shield={shield}
      context={
        <div className="space-y-6">
          {viewer ? null : <SignedOutPanel />}
          <section className="rounded-lg border border-border bg-surface-1 p-5">
            <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">
              The spoiler shield
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
              Off by default, so you see everything. Turn it on from the pill in the header and say how far you have
              played, and post and reply bodies past that point are held back until you ask for them. Titles always
              stay visible, and revealing one thing never moves your chapter.
            </p>
          </section>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

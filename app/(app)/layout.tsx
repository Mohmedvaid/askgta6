import { AppShell } from "@/components/shell/AppShell";
import { ProgressPanel } from "@/components/shell/ProgressPanel";
import { ProgressSheet } from "@/components/shell/ProgressSheet";
import { SignedOutPanel } from "@/components/shell/SignedOutPanel";
import { getViewer, getViewerProgress, needsProgressPrompt } from "@/lib/viewer";
import { listMyGroups } from "@/lib/queries/groups";
import { avatarUrl } from "@/lib/queries/profiles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const progress = await getViewerProgress();
  const promptOnLoad = await needsProgressPrompt();
  const groups = viewer ? await listMyGroups(viewer.userId) : [];
  const url = await avatarUrl(viewer?.avatarPath);

  return (
    <>
      <AppShell
        groups={groups}
        username={viewer?.username ?? null}
        avatarUrl={url}
        context={
          <div className="space-y-6">
            <ProgressPanel progress={progress} />
            {viewer ? null : <SignedOutPanel />}
            <section className="rounded-lg border border-border bg-surface-1 p-5">
              <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">
                How the gate works
              </h2>
              <p className="mt-3 text-sm text-text-secondary">
                Titles are always visible, so you can see what a thread is about before you open it. Bodies past
                where you have played stay sealed until you ask, and revealing one never moves your progress.
              </p>
            </section>
          </div>
        }
      >
        {children}
      </AppShell>

      <ProgressSheet progress={progress} promptOnLoad={promptOnLoad} />
    </>
  );
}

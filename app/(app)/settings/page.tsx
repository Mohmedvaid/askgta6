import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/form/ProfileForm";
import { AvatarForm } from "@/components/form/AvatarForm";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { getViewer } from "@/lib/viewer";
import { avatarUrl } from "@/lib/queries/profiles";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Settings", robots: NOINDEX };

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in?next=/settings");

  const url = await avatarUrl(viewer.avatarPath);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Settings</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your progress control lives in the sidebar and takes effect everywhere the moment you save it.
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Profile</h2>
        <ProfileForm username={viewer.username} displayName={viewer.displayName} />
      </section>

      <section className="space-y-6">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Avatar</h2>
        <AvatarForm username={viewer.username} url={url} />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Theme</h2>
        <ThemeToggle theme={viewer.theme} />
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Session</h2>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-secondary">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

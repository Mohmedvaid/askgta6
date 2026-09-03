import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/form/OnboardingForm";
import { getViewer, getViewerProgress } from "@/lib/viewer";
import { isPlaceholderUsername } from "@/lib/username";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Pick a name", robots: NOINDEX };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");
  if (!isPlaceholderUsername(viewer.username)) redirect("/feed");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Two things and you are in</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Pick a name people will see, then say how far you have played. You can change both later.
        </p>
      </header>
      <OnboardingForm progress={await getViewerProgress()} />
    </div>
  );
}

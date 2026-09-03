import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/form/OnboardingForm";
import { getViewer } from "@/lib/viewer";
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
        <h1 className="font-display text-3xl font-bold text-text-primary">One thing and you are in</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Pick a name people will see. You can change it later.
        </p>
      </header>
      <OnboardingForm />
    </div>
  );
}

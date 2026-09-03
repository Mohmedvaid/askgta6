import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GroupComposer } from "@/components/group/GroupComposer";
import { getViewer } from "@/lib/viewer";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Create a group", robots: NOINDEX };

export default async function NewGroupPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Create a group</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Public groups anyone can join. Private groups are invite only and invisible to everyone else.
        </p>
      </header>
      <GroupComposer />
    </div>
  );
}

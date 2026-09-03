import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PostComposer } from "@/components/form/PostComposer";
import { createPost } from "@/actions/posts";
import { getViewer } from "@/lib/viewer";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "New post", robots: NOINDEX };

export default async function NewPostPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">New post</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your spoiler level starts where your progress is. Raise it if the post gives anything away.
        </p>
      </header>

      <PostComposer action={createPost} submitLabel="Publish" defaults={{ spoilerLevel: viewer.progress }} />
    </div>
  );
}

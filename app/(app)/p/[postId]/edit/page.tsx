import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/form/PostComposer";
import { editPost } from "@/actions/posts";
import { getPostRaw } from "@/lib/queries/posts";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const post = await getPostRaw(postId);
  if (!post) notFound();
  if (post.author_id !== viewer.userId) redirect(`/p/${postId}`);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-text-primary">Edit post</h1>
      <PostComposer
        action={editPost}
        submitLabel="Save changes"
        defaults={{
          postId: post.id,
          title: post.title,
          body: post.body,
          topic: post.topic,
          kind: post.kind,
          spoilerLevel: post.spoiler_level,
        }}
      />
    </div>
  );
}

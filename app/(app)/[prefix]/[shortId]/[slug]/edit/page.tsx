import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { PostComposer } from "@/components/form/PostComposer";
import { editPost } from "@/actions/posts";
import { getPostRawByShortId } from "@/lib/queries/posts";
import { getViewer } from "@/lib/viewer";
import { NOINDEX } from "@/lib/indexing";
import { isPostPrefix, postPath, prefixForKind } from "@/lib/post-url";

export const metadata: Metadata = { title: "Edit post", robots: NOINDEX };

type Params = Promise<{ prefix: string; shortId: string; slug: string }>;

export default async function EditPostPage({ params }: { params: Params }) {
  const { prefix, shortId, slug } = await params;
  if (!isPostPrefix(prefix)) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const post = await getPostRawByShortId(shortId);
  if (!post) notFound();

  // The same rule as the thread itself: the short id resolved it, so anything
  // else in the path is stale rather than wrong.
  if (prefix !== prefixForKind(post.kind) || slug !== post.slug) permanentRedirect(`${postPath(post)}/edit`);
  if (post.author_id !== viewer.userId) redirect(postPath(post));

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

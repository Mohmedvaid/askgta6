import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/form/PostComposer";
import { createPost } from "@/actions/posts";
import { getGroupBySlug, isMember } from "@/lib/queries/groups";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "New group post" };

export default async function NewGroupPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const group = await getGroupBySlug(slug);
  if (!group) notFound();
  if (!(await isMember(group.id, viewer.userId))) redirect(`/g/${slug}`);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">New post in {group.name}</h1>
        <p className="mt-2 text-sm text-text-secondary">Only members of this group will see it.</p>
      </header>

      <PostComposer
        action={createPost}
        submitLabel="Publish"
        defaults={{ spoilerLevel: viewer.progress, groupId: group.id }}
      />
    </div>
  );
}

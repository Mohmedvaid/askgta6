import { groupIsIndexable, indexingEnabled } from "@/lib/indexing";
import { getGroupBySlug } from "@/lib/queries/groups";
import { listSyndicatedPosts } from "@/lib/queries/posts";
import { feedResponse, renderFeed } from "@/lib/rss";

export const dynamic = "force-dynamic";

/** A public group's feed. A private group has none, and says so with a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);

  if (!group || !groupIsIndexable(group)) {
    return new Response("Not found", { status: 404 });
  }

  const items = indexingEnabled() ? await listSyndicatedPosts(group.id) : [];

  return feedResponse(
    renderFeed({
      title: `${group.name}, AskGTA6`,
      description: group.description ?? `Spoiler free threads from ${group.name}.`,
      path: `/g/${group.slug}/feed.xml`,
      items,
    }),
  );
}

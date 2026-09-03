import { indexingEnabled } from "@/lib/indexing";
import { listSyndicatedPosts } from "@/lib/queries/posts";
import { feedResponse, renderFeed } from "@/lib/rss";

export const dynamic = "force-dynamic";

/**
 * The site feed. Empty while NEXT_PUBLIC_INDEXING is off, exactly as the sitemap
 * is: a feed is a syndication surface, and syndicating a site that is asking not
 * to be indexed defeats the point of the flag.
 */
export async function GET() {
  const items = indexingEnabled() ? await listSyndicatedPosts() : [];

  return feedResponse(
    renderFeed({
      title: "AskGTA6",
      description: "Spoiler free GTA VI threads, trailer level only.",
      path: "/feed.xml",
      items,
    }),
  );
}

import type { Metadata } from "next";
import { FeedTabs } from "@/components/shell/FeedTabs";
import { TopicFilter } from "@/components/shell/TopicFilter";
import { PostList } from "@/components/post/PostList";
import { listPosts, type FeedTab } from "@/lib/queries/posts";
import { getViewerProgress } from "@/lib/viewer";
import { isTopic } from "@/lib/topics";
import { feedIsIndexable, robotsFor } from "@/lib/indexing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const search = single((await searchParams).q);
  return { title: "Feed", robots: robotsFor(feedIsIndexable(search)) };
}

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = single(params.q);
  const tabParam = single(params.tab);
  const tab: FeedTab = tabParam === "top" || tabParam === "unanswered" ? tabParam : "latest";
  const topicParam = single(params.topic);
  const topic = isTopic(topicParam) ? topicParam : null;
  const cursor = single(params.cursor);
  const page = Number(single(params.page) ?? 0);

  const progress = await getViewerProgress();
  const result = await listPosts(
    { tab, topic, cursor, search, page: Number.isFinite(page) ? page : 0 },
    progress,
  );

  const moreParams = new URLSearchParams();
  if (search) moreParams.set("q", search);
  if (tab !== "latest") moreParams.set("tab", tab);
  if (topic) moreParams.set("topic", topic);
  if (result.nextCursor) moreParams.set("cursor", result.nextCursor);
  if (result.nextPage !== null) moreParams.set("page", String(result.nextPage));

  const moreHref = result.nextCursor || result.nextPage !== null ? `/feed?${moreParams.toString()}` : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">
          {search ? `Results for ${search}` : "Feed"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Everything past your progress is held back until you ask for it.
        </p>
      </header>

      {search ? null : (
        <div className="space-y-6">
          <FeedTabs basePath="/feed" active={tab} topic={topic} />
          <TopicFilter basePath="/feed" active={topic} tab={tab} hubs />
        </div>
      )}

      <PostList
        page={result}
        moreHref={moreHref}
        emptyTitle={search ? "No matches" : "Nothing here yet"}
        emptyBody={
          search
            ? "Try fewer words, or a different spelling."
            : "Start the first thread and someone will answer it."
        }
        emptyActionLabel={search ? undefined : "Write a post"}
        emptyActionHref={search ? undefined : "/new"}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedTabs } from "@/components/shell/FeedTabs";
import { TopicFilter } from "@/components/shell/TopicFilter";
import { PostList } from "@/components/post/PostList";
import { JsonLd } from "@/components/seo/JsonLd";
import { listPosts, type FeedTab } from "@/lib/queries/posts";
import { getViewerProgress } from "@/lib/viewer";
import { TOPICS, isTopic } from "@/lib/topics";
import { robotsFor } from "@/lib/indexing";
import { topicDescription, topicPath, topicTitle } from "@/lib/topic-page";
import { topicJsonLd } from "@/lib/structured-data";

type Params = Promise<{ topic: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Seven of them, and they never change, so the hubs are static routes in all but name. */
export function generateStaticParams() {
  return TOPICS.map((topic) => ({ topic }));
}

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { topic } = await params;
  if (!isTopic(topic)) return { title: "Topic not found", robots: robotsFor(false) };

  const title = topicTitle(topic);
  const description = topicDescription(topic);

  return {
    title,
    description,
    // A hub is the one page on this site that is worth ranking for a topic, so it
    // is indexable whatever the tab. The query string never reaches the canonical.
    robots: robotsFor(true),
    alternates: { canonical: topicPath(topic) },
    openGraph: { title, description, url: topicPath(topic) },
  };
}

export default async function TopicPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { topic } = await params;
  if (!isTopic(topic)) notFound();

  const query = await searchParams;
  const tabParam = single(query.tab);
  const tab: FeedTab = tabParam === "top" || tabParam === "unanswered" ? tabParam : "latest";
  const cursor = single(query.cursor);
  const page = Number(single(query.page) ?? 0);

  const result = await listPosts(
    { tab, topic, cursor, page: Number.isFinite(page) ? page : 0 },
    await getViewerProgress(),
  );

  const moreParams = new URLSearchParams();
  if (tab !== "latest") moreParams.set("tab", tab);
  if (result.nextCursor) moreParams.set("cursor", result.nextCursor);
  if (result.nextPage !== null) moreParams.set("page", String(result.nextPage));

  const moreHref =
    result.nextCursor || result.nextPage !== null ? `${topicPath(topic)}?${moreParams.toString()}` : null;

  return (
    <div className="space-y-8">
      <JsonLd data={topicJsonLd(topic)} />
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">{topicTitle(topic)}</h1>
        <p className="mt-2 text-sm text-text-secondary">{topicDescription(topic)}</p>
      </header>

      <div className="space-y-6">
        <FeedTabs basePath={topicPath(topic)} active={tab} />
        <TopicFilter basePath="/feed" active={topic} hubs />
      </div>

      <PostList
        page={result}
        moreHref={moreHref}
        emptyTitle="Nothing here yet"
        emptyBody="Be the first to ask something about this."
        emptyActionLabel="Write a post"
        emptyActionHref="/new"
      />
    </div>
  );
}

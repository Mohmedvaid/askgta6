import type { Metadata } from "next";
import Link from "next/link";
import { FeedTabs } from "@/components/shell/FeedTabs";
import { TopicFilter } from "@/components/shell/TopicFilter";
import { PostList } from "@/components/post/PostList";
import { InvitePanel } from "@/components/group/InvitePanel";
import { PrivateGroupGate } from "@/components/group/PrivateGroupGate";
import { joinGroup, leaveGroup } from "@/actions/groups";
import { getGroupBySlug, isMember, listInvites } from "@/lib/queries/groups";
import { listPosts, type FeedTab } from "@/lib/queries/posts";
import { getViewer, getViewerProgress } from "@/lib/viewer";
import { isTopic } from "@/lib/topics";
import { groupIsIndexable, robotsFor } from "@/lib/indexing";
import { groupJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  // A private group the viewer cannot see comes back null, so it is never indexable.
  return { title: group?.name ?? "Group", robots: robotsFor(groupIsIndexable(group)) };
}

export default async function GroupPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewer();
  const group = await getGroupBySlug(slug);

  if (!group) {
    // A private group the viewer cannot see is indistinguishable from a missing one,
    // except that a person holding an invite code needs somewhere to paste it.
    return <PrivateGroupGate />;
  }

  const member = await isMember(group.id, viewer?.userId ?? null);
  const owner = viewer?.userId === group.owner_id;
  const invites = owner && group.visibility === "private" ? await listInvites(group.id) : [];

  const tabParam = single(query.tab);
  const tab: FeedTab = tabParam === "top" || tabParam === "unanswered" ? tabParam : "latest";
  const topicParam = single(query.topic);
  const topic = isTopic(topicParam) ? topicParam : null;
  const cursor = single(query.cursor);
  const page = Number(single(query.page) ?? 0);

  const result = await listPosts(
    { tab, topic, cursor, groupId: group.id, page: Number.isFinite(page) ? page : 0 },
    await getViewerProgress(),
  );

  const moreParams = new URLSearchParams();
  if (tab !== "latest") moreParams.set("tab", tab);
  if (topic) moreParams.set("topic", topic);
  if (result.nextCursor) moreParams.set("cursor", result.nextCursor);
  if (result.nextPage !== null) moreParams.set("page", String(result.nextPage));
  const moreHref = result.nextCursor || result.nextPage !== null ? `/g/${slug}?${moreParams.toString()}` : null;

  return (
    <div className="space-y-8">
      <JsonLd data={groupJsonLd(group)} />
      <header className="rounded-lg border border-border bg-surface-1 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">{group.name}</h1>
            <p className="mt-1 text-xs text-text-muted">
              {group.visibility === "private" ? "Private group" : "Public group"} &middot; {group.member_count}{" "}
              {group.member_count === 1 ? "member" : "members"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {member ? (
              <>
                <Link
                  href={`/g/${slug}/new`}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text"
                >
                  New post
                </Link>
                {owner ? null : (
                  <form action={leaveGroup}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <button type="submit" className="text-sm font-semibold text-text-secondary">
                      Leave
                    </button>
                  </form>
                )}
              </>
            ) : viewer && group.visibility === "public" ? (
              <form action={joinGroup}>
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="slug" value={slug} />
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text"
                >
                  Join group
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {group.description ? <p className="mt-4 text-sm text-text-secondary">{group.description}</p> : null}
      </header>

      {owner && group.visibility === "private" ? <InvitePanel group={group} invites={invites} /> : null}

      <div className="space-y-6">
        <FeedTabs basePath={`/g/${slug}`} active={tab} topic={topic} />
        <TopicFilter basePath={`/g/${slug}`} active={topic} tab={tab} />
      </div>

      <PostList
        page={result}
        moreHref={moreHref}
        emptyTitle="No posts in here yet"
        emptyBody={member ? "Start the first thread for this group." : "Join the group to start a thread."}
        emptyActionLabel={member ? "Write a post" : undefined}
        emptyActionHref={member ? `/g/${slug}/new` : undefined}
      />
    </div>
  );
}

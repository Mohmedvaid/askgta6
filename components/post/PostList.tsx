import { PostCard } from "./PostCard";
import { LoadMore } from "./LoadMore";
import { Empty } from "../Empty";
import type { FeedPage } from "@/lib/queries/posts";

type PostListProps = {
  page: FeedPage;
  moreHref: string | null;
  emptyTitle: string;
  emptyBody: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
};

export function PostList({ page, moreHref, emptyTitle, emptyBody, emptyActionLabel, emptyActionHref }: PostListProps) {
  if (page.items.length === 0) {
    return (
      <Empty title={emptyTitle} body={emptyBody} actionLabel={emptyActionLabel} actionHref={emptyActionHref} />
    );
  }

  return (
    <div>
      {page.items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {moreHref ? <LoadMore href={moreHref} /> : null}
    </div>
  );
}

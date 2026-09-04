import Link from "next/link";
import { TOPIC_LABELS, type Topic } from "@/lib/topics";
import { topicPath } from "@/lib/topic-page";

/**
 * The topic chip on a post, and a link to that topic's hub, which is what turns
 * every card in every feed into a route into the hub pages.
 *
 * It is always rendered outside the card's own link, never inside one, because
 * an anchor cannot nest.
 */
export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    <Link
      href={topicPath(topic)}
      className="inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-xs font-medium tracking-wide text-text-secondary uppercase"
    >
      {TOPIC_LABELS[topic]}
    </Link>
  );
}

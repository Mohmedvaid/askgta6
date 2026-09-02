import { TOPIC_LABELS, type Topic } from "@/lib/topics";

export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-xs font-medium tracking-wide text-text-secondary uppercase">
      {TOPIC_LABELS[topic]}
    </span>
  );
}

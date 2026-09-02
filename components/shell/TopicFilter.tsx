import Link from "next/link";
import { TOPICS, TOPIC_LABELS, type Topic } from "@/lib/topics";

type TopicFilterProps = {
  basePath: string;
  active: Topic | null;
  tab?: string;
};

export function TopicFilter({ basePath, active, tab }: TopicFilterProps) {
  const href = (topic: Topic | null) => {
    const params = new URLSearchParams();
    if (tab && tab !== "latest") params.set("tab", tab);
    if (topic) params.set("topic", topic);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const chipClass = (isActive: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      isActive ? "border-accent bg-accent-bg text-accent" : "border-border text-text-secondary"
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={href(null)} className={chipClass(active === null)}>
        All topics
      </Link>
      {TOPICS.map((topic) => (
        <Link key={topic} href={href(topic)} className={chipClass(active === topic)}>
          {TOPIC_LABELS[topic]}
        </Link>
      ))}
    </div>
  );
}

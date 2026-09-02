import Link from "next/link";

const TABS = [
  { id: "latest", label: "Latest" },
  { id: "top", label: "Top" },
  { id: "unanswered", label: "Unanswered" },
];

type FeedTabsProps = {
  basePath: string;
  active: string;
  topic?: string | null;
};

export function FeedTabs({ basePath, active, topic }: FeedTabsProps) {
  return (
    <nav aria-label="Feed sort" className="flex gap-6 border-b border-border">
      {TABS.map((tab) => {
        const params = new URLSearchParams();
        if (tab.id !== "latest") params.set("tab", tab.id);
        if (topic) params.set("topic", topic);
        const query = params.toString();
        const isActive = active === tab.id;

        return (
          <Link
            key={tab.id}
            href={query ? `${basePath}?${query}` : basePath}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${
              isActive ? "border-accent text-text-primary" : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createFakeClient, type FakeClient } from "./fake-supabase";

/**
 * The topic hubs. Seven fixed pages, one per topic, that exist to be the thing a
 * search engine can rank for a topic and the thing a chip can point at. A query
 * string on the feed is neither.
 */

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

vi.mock("@/lib/viewer", () => ({
  getViewer: async () => null,
  getViewerProgress: async () => 0,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { default: TopicPage, generateMetadata: topicMetadata, generateStaticParams } = await import(
  "@/app/(app)/topic/[topic]/page"
);
const { TopicFilter } = await import("@/components/shell/TopicFilter");
const { TopicBadge } = await import("@/components/TopicBadge");
const { topicJsonLd } = await import("@/lib/structured-data");
const { TOPICS, TOPIC_LABELS } = await import("@/lib/topics");
const { topicPath } = await import("@/lib/topic-page");

const original = process.env.NEXT_PUBLIC_INDEXING;

function setFlag(value: "on" | "off") {
  process.env.NEXT_PUBLIC_INDEXING = value;
}

function params(topic: string) {
  return { params: Promise.resolve({ topic }), searchParams: Promise.resolve({}) };
}

function robotsOf(metadata: { robots?: unknown }) {
  return metadata.robots as { index: boolean; follow: boolean };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_INDEXING = original ?? "off";
  holder.client = createFakeClient({ tables: { posts: { data: [], error: null } } });
});

describe("the hub routes", () => {
  it("has one for every topic, and no more", () => {
    expect(generateStaticParams()).toEqual(TOPICS.map((topic) => ({ topic })));
  });

  it("404s a topic that is not one of ours, rather than showing an empty feed", async () => {
    await expect(TopicPage(params("cheese"))).rejects.toThrow("NOT_FOUND");
  });

  it("filters the feed to its own topic", async () => {
    await TopicPage(params("map"));
    expect(holder.client.calls).toContainEqual({ method: "eq", args: ["topic", "map"] });
  });

  it("carries the tab into the more link and never the topic, which is the path", async () => {
    holder.client = createFakeClient({
      tables: { posts: { data: Array.from({ length: 20 }, () => row()), error: null } },
    });

    const element = (await TopicPage({
      params: Promise.resolve({ topic: "map" }),
      searchParams: Promise.resolve({ tab: "top" }),
    })) as { props: { children: unknown[] } };

    const more = JSON.stringify(element.props.children);
    expect(more).toContain("/topic/map?tab=top");
    expect(more).not.toContain("topic=map");
  });
});

describe("what a hub tells a crawler", () => {
  it("is indexable once the flag is on, with a title and a description of its own", async () => {
    setFlag("off");
    expect(robotsOf(await topicMetadata(params("map")))).toMatchObject({ index: false, follow: false });

    setFlag("on");
    const metadata = await topicMetadata(params("map"));
    expect(robotsOf(metadata)).toMatchObject({ index: true, follow: true });
    expect(metadata.title).toBe("Map questions and discussions");
    expect(metadata.description).toBeTruthy();
    expect(metadata.alternates?.canonical).toBe("/topic/map");
  });

  it("gives every topic a title and a description that are not the same as each other's", async () => {
    setFlag("on");
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const topic of TOPICS) {
      const metadata = await topicMetadata(params(topic));
      titles.add(String(metadata.title));
      descriptions.add(String(metadata.description));
    }

    expect(titles.size).toBe(TOPICS.length);
    expect(descriptions.size).toBe(TOPICS.length);
  });

  it("says nothing indexable about a topic that does not exist", async () => {
    setFlag("on");
    expect(robotsOf(await topicMetadata(params("cheese")))).toMatchObject({ index: false, follow: false });
  });

  it("emits a CollectionPage only while indexing is on", () => {
    setFlag("off");
    expect(topicJsonLd("map")).toBeNull();

    setFlag("on");
    expect(topicJsonLd("map")).toMatchObject({
      "@type": "CollectionPage",
      url: "http://localhost:3000/topic/map",
      name: "Map questions and discussions",
    });
  });
});

describe("the topic chips", () => {
  it("points every chip at a hub on the site wide feed", () => {
    render(<TopicFilter basePath="/feed" active={null} hubs />);

    for (const topic of TOPICS) {
      const link = screen.getByRole("link", { name: TOPIC_LABELS[topic] });
      expect(link).toHaveAttribute("href", topicPath(topic));
    }
    expect(screen.getByRole("link", { name: "All topics" })).toHaveAttribute("href", "/feed");
  });

  it("keeps filtering in place inside a group, where a hub would take the reader out of it", () => {
    render(<TopicFilter basePath="/g/vice-city-locals" active="map" tab="top" />);

    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute(
      "href",
      "/g/vice-city-locals?tab=top&topic=map",
    );
  });

  it("makes the chip on a post card a link into the hub", () => {
    render(<TopicBadge topic="vehicles" />);
    expect(screen.getByRole("link", { name: "Vehicles" })).toHaveAttribute("href", "/topic/vehicles");
  });
});

function row() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    short_id: "k3m91xqz",
    slug: "a-thread",
    author_id: "aaaa",
    group_id: null,
    topic: "map",
    kind: "question",
    title: "A thread that is long enough",
    body: "A body.",
    spoiler_level: 0,
    vote_count: 0,
    reply_count: 0,
    accepted_reply_id: null,
    is_hidden: false,
    created_at: "2026-06-01T12:00:00.000Z",
    author: [{ username: "mara", display_name: "Mara", avatar_path: null }],
    group: null,
  };
}

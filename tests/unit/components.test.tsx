import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Avatar } from "@/components/Avatar";
import { Empty } from "@/components/Empty";
import { Mark } from "@/components/brand/Mark";
import { Wordmark } from "@/components/brand/Wordmark";
import { SpoilerBadge } from "@/components/SpoilerBadge";
import { SpoilerLevelControl } from "@/components/SpoilerLevelControl";
import { TopicBadge } from "@/components/TopicBadge";
import { SpoilerDemo } from "@/components/SpoilerDemo";
import { PostCard } from "@/components/post/PostCard";
import { PostBody } from "@/components/post/PostBody";
import { PostList } from "@/components/post/PostList";
import { LoadMore } from "@/components/post/LoadMore";
import { SpoilerPlaceholder } from "@/components/post/SpoilerPlaceholder";
import { FeedTabs } from "@/components/shell/FeedTabs";
import { TopicFilter } from "@/components/shell/TopicFilter";
import { SearchBox } from "@/components/shell/SearchBox";
import { SignedOutPanel } from "@/components/shell/SignedOutPanel";
import { HeaderBar } from "@/components/shell/HeaderBar";
import { NavRail } from "@/components/shell/NavRail";
import { BottomBar } from "@/components/shell/BottomBar";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { CopyField } from "@/components/group/CopyField";
import { FieldError } from "@/components/form/FieldError";
import type { GatedPost } from "@/lib/queries/posts";

vi.mock("@/actions/profile", () => ({
  setTheme: async () => undefined,
  setProgress: async () => ({ ok: true, data: undefined }),
}));

const author = { username: "mara", display_name: "Mara", avatar_path: null };

const visiblePost = {
  hidden: false as const,
  id: "post-1",
  author_id: "aaaa",
  group_id: null,
  topic: "map" as const,
  kind: "question" as const,
  title: "How big is Leonida",
  body: "Trailer two shows a lot of coastline and swamp.",
  spoiler_level: 0,
  vote_count: 4,
  reply_count: 2,
  accepted_reply_id: null,
  is_hidden: false,
  created_at: new Date().toISOString(),
  author,
  group: null,
};

const hiddenPost: GatedPost = {
  hidden: true,
  id: "post-2",
  author_id: "aaaa",
  group_id: null,
  topic: "story",
  kind: "discussion",
  spoiler_level: 5,
  vote_count: 9,
  reply_count: 3,
  accepted_reply_id: null,
  is_hidden: false,
  created_at: new Date().toISOString(),
  author,
  group: null,
};

describe("brand", () => {
  it("labels the wordmark and the square mark", () => {
    render(<Wordmark />);
    render(<Mark />);
    expect(screen.getAllByRole("img", { name: "AskGTA6" })).toHaveLength(2);
  });
});

describe("Avatar", () => {
  it("falls back to the mark when there is no image", () => {
    render(<Avatar username="mara" />);
    expect(screen.getByRole("img", { name: "AskGTA6" })).toBeInTheDocument();
  });

  it("renders the image when there is one", () => {
    render(<Avatar username="mara" url="https://cdn.test/a.png" size={48} />);
    const image = screen.getByRole("img", { name: "mara avatar" });
    expect(image).toHaveAttribute("src", "https://cdn.test/a.png");
    expect(image).toHaveAttribute("width", "48");
  });
});

describe("badges", () => {
  it("names the spoiler level and describes it", () => {
    render(<SpoilerBadge level={3} />);
    expect(screen.getByText("Chapter 3")).toBeInTheDocument();
    expect(screen.getByTitle(/third act/i)).toBeInTheDocument();
  });

  it("clamps a level that is out of range", () => {
    render(<SpoilerBadge level={99} tone="loud" />);
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("labels the topic", () => {
    render(<TopicBadge topic="vehicles" />);
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
  });
});

describe("Empty", () => {
  it("names the space and offers one verb", () => {
    render(<Empty title="Nothing here yet" body="Start the first thread." actionLabel="Write a post" actionHref="/new" />);
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write a post" })).toHaveAttribute("href", "/new");
  });

  it("renders without an action", () => {
    render(<Empty title="No replies yet" body="Be the first." />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("FieldError", () => {
  it("renders nothing without a message and an alert with one", () => {
    const { rerender } = render(<FieldError />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<FieldError message="That username is taken." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That username is taken.");
  });
});

describe("PostCard", () => {
  it("shows the title and an excerpt for a visible post", () => {
    render(<PostCard post={visiblePost} />);
    expect(screen.getByRole("heading", { name: "How big is Leonida" })).toBeInTheDocument();
    expect(screen.getByText(/coastline and swamp/)).toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(screen.getByText("2 replies")).toBeInTheDocument();
  });

  it("shows the placeholder and a reveal button for a hidden post", () => {
    render(<PostCard post={hiddenPost} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal anyway" })).toBeInTheDocument();
    expect(screen.getByText("Chapter 5")).toBeInTheDocument();
  });

  it("singularizes counts and marks answered threads", () => {
    render(
      <PostCard
        post={{ ...visiblePost, vote_count: 1, reply_count: 1, accepted_reply_id: "r1", kind: "discussion" }}
      />,
    );
    expect(screen.getByText("1 vote")).toBeInTheDocument();
    expect(screen.getByText("1 reply")).toBeInTheDocument();
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByText("Question")).not.toBeInTheDocument();
  });

  it("links the group when the post has one", () => {
    render(<PostCard post={{ ...visiblePost, group: { slug: "vice", name: "Vice City locals", visibility: "public" } }} />);
    expect(screen.getByRole("link", { name: "Vice City locals" })).toHaveAttribute("href", "/g/vice");
  });
});

describe("PostList", () => {
  it("renders an empty state when there is nothing", () => {
    render(
      <PostList
        page={{ items: [], nextCursor: null, nextPage: null }}
        moreHref={null}
        emptyTitle="Nothing here yet"
        emptyBody="Start the first thread."
      />,
    );
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
  });

  it("renders cards and the load more link", () => {
    render(
      <PostList
        page={{ items: [visiblePost, hiddenPost], nextCursor: "abc", nextPage: null }}
        moreHref="/feed?cursor=abc"
        emptyTitle="Nothing"
        emptyBody="Nothing"
      />,
    );
    expect(screen.getByRole("heading", { name: "How big is Leonida" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute("href", "/feed?cursor=abc");
  });
});

describe("LoadMore and PostBody", () => {
  it("links forward and renders markdown", () => {
    render(<LoadMore href="/feed?page=2" />);
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute("href", "/feed?page=2");

    const { container } = render(<PostBody body="Hello **world**" />);
    expect(container.querySelector("strong")).toHaveTextContent("world");
  });

  it("renders more placeholder bars in the full variant", () => {
    const { container: card } = render(<SpoilerPlaceholder variant="card" />);
    const { container: full } = render(<SpoilerPlaceholder variant="full" />);
    expect(full.querySelectorAll("div").length).toBeGreaterThan(card.querySelectorAll("div").length);
  });
});

describe("SpoilerLevelControl", () => {
  it("shows the description of the level as it moves", () => {
    const onChange = vi.fn();
    render(<SpoilerLevelControl name="progress" defaultValue={0} label="How far" onChange={onChange} />);

    const slider = screen.getByRole("slider", { name: "How far" });
    expect(screen.getByText(/Trailers and announced facts/)).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "7" } });
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });

  it("renders the hint when one is given", () => {
    render(<SpoilerLevelControl name="progress" defaultValue={2} label="Level" hint="Tag it higher." />);
    expect(screen.getByText("Tag it higher.")).toBeInTheDocument();
  });
});

describe("SpoilerDemo", () => {
  it("seals the sample cards at level 0 and opens them as the slider moves", () => {
    render(<SpoilerDemo />);
    expect(screen.getByRole("heading", { name: /How big is Leonida/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /second act job/ })).not.toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: /Drag to set/ });
    fireEvent.change(slider, { target: { value: "7" } });

    expect(screen.getByRole("heading", { name: /second act job/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /near the end of the story/ })).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("marks the active feed tab and carries the topic", () => {
    render(<FeedTabs basePath="/feed" active="top" topic="map" />);
    const active = screen.getByRole("link", { name: "Top" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("href", "/feed?tab=top&topic=map");
    expect(screen.getByRole("link", { name: "Latest" })).toHaveAttribute("href", "/feed?topic=map");
  });

  it("builds topic chip links and an all topics reset", () => {
    render(<TopicFilter basePath="/feed" active="vehicles" tab="top" />);
    expect(screen.getByRole("link", { name: "All topics" })).toHaveAttribute("href", "/feed?tab=top");
    expect(screen.getByRole("link", { name: "Vehicles" })).toHaveAttribute("href", "/feed?tab=top&topic=vehicles");
  });

  it("resets to the bare path when nothing is selected", () => {
    render(<TopicFilter basePath="/feed" active={null} />);
    expect(screen.getByRole("link", { name: "All topics" })).toHaveAttribute("href", "/feed");
  });

  it("points the search box at the feed", () => {
    render(<SearchBox defaultValue="airboat" />);
    expect(screen.getByRole("searchbox", { name: "Search posts" })).toHaveValue("airboat");
  });

  it("shows sign in links when logged out and a profile link when logged in", () => {
    const { rerender } = render(<HeaderBar username={null} avatarUrl={null} />);
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();

    rerender(<HeaderBar username="mara" avatarUrl={null} />);
    expect(screen.getByRole("link", { name: /mara/ })).toHaveAttribute("href", "/u/mara");
  });

  it("lists the viewer's groups in the rail only when signed in", () => {
    const group = {
      id: "g1",
      slug: "vice",
      name: "Vice City locals",
      description: null,
      visibility: "public" as const,
      owner_id: "a",
      member_count: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    };

    const { rerender } = render(<NavRail groups={[group]} signedIn />);
    const rail = screen.getByRole("navigation", { name: "Primary" });
    expect(within(rail).getByRole("link", { name: "Vice City locals" })).toBeInTheDocument();

    rerender(<NavRail groups={[]} signedIn={false} />);
    expect(screen.queryByText("Your groups")).not.toBeInTheDocument();
  });

  it("says so when a signed in person has no groups", () => {
    render(<NavRail groups={[]} signedIn />);
    expect(screen.getByText("None yet.")).toBeInTheDocument();
  });

  it("gives the bottom bar four destinations", () => {
    render(<BottomBar />);
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link")).toHaveLength(4);
  });

  it("renders the shell with and without a context column", () => {
    const { rerender } = render(
      <AppShell groups={[]} username={null} avatarUrl={null} context={<p>Context here</p>}>
        <p>Main content</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: "Context" })).toHaveTextContent("Context here");

    rerender(
      <AppShell groups={[]} username={null} avatarUrl={null}>
        <p>Main content</p>
      </AppShell>,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("invites the signed out reader to make an account", () => {
    render(<SignedOutPanel />);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/auth/sign-up");
  });

  it("offers the opposite theme", () => {
    const { rerender } = render(<ThemeToggle theme="dark" />);
    expect(screen.getByRole("button", { name: "Switch to light" })).toBeInTheDocument();
    rerender(<ThemeToggle theme="light" />);
    expect(screen.getByRole("button", { name: "Switch to dark" })).toBeInTheDocument();
  });
});

describe("CopyField", () => {
  it("copies the absolute url and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyField value="/g/join/NIGHTRUN" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/g/join/NIGHTRUN`);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

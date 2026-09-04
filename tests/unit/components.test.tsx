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
import { JsonLd } from "@/components/seo/JsonLd";
import { Honeypot } from "@/components/form/Honeypot";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
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
import { UserMenu } from "@/components/shell/UserMenu";
import { CopyField } from "@/components/group/CopyField";
import { FieldError } from "@/components/form/FieldError";
import type { GatedPost } from "@/lib/queries/posts";

vi.mock("@/actions/profile", () => ({
  setTheme: async () => undefined,
  setProgress: async () => ({ ok: true, data: undefined }),
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));

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
  title: "A late game thread about the ending",
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

  it("renders the image through the optimizer when there is one", () => {
    render(<Avatar username="mara" url="https://cdn.test/a.png" size={48} />);
    const image = screen.getByRole("img", { name: "mara avatar" });

    // next/image rewrites the src to /_next/image with the original in the query.
    expect(image.getAttribute("src")).toContain(encodeURIComponent("https://cdn.test/a.png"));
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

  it("keeps the title and seals only the body for a hidden post", () => {
    render(<PostCard post={hiddenPost} />);
    expect(screen.getByRole("heading", { name: "A late game thread about the ending" })).toBeInTheDocument();
    expect(screen.getByText("Body hidden until Chapter 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal anyway" })).toBeInTheDocument();
    expect(screen.getAllByText("Chapter 5").length).toBeGreaterThan(0);
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

  it("keeps the spoiler level badge on a card the shield is not holding back", () => {
    // The shield being off makes a level 6 post visible, but the badge stays so a
    // reader can still see what they are about to read.
    render(<PostCard post={{ ...visiblePost, spoiler_level: 6 }} />);

    expect(screen.getByText("Chapter 6")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How big is Leonida" })).toBeInTheDocument();
    expect(screen.queryByText(/Body hidden until/)).not.toBeInTheDocument();
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
    const { container: card } = render(<SpoilerPlaceholder variant="card" level={2} />);
    const { container: full } = render(<SpoilerPlaceholder variant="full" level={2} />);
    expect(full.querySelectorAll("div").length).toBeGreaterThan(card.querySelectorAll("div").length);
    expect(screen.getAllByText("Body hidden until Chapter 2")).toHaveLength(2);
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
  it("shows the same post with the shield off and with it on", () => {
    render(<SpoilerDemo />);

    // One post, two panels. The title is in both; the body is only in the open one.
    expect(screen.getAllByRole("heading", { name: /fourth act job/ })).toHaveLength(2);
    expect(screen.getByText(/mid game answer/)).toBeInTheDocument();
    expect(screen.getByText("Body hidden until Chapter 4")).toBeInTheDocument();

    expect(screen.getByText("Shield off")).toBeInTheDocument();
    expect(screen.getByText("Shield on, Haven't played")).toBeInTheDocument();
  });

  it("is static, with no control to move", () => {
    const { container } = render(<SpoilerDemo />);
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("JsonLd", () => {
  it("renders nothing when the page is not indexable", () => {
    const { container } = render(<JsonLd data={null} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("escapes a title that would close the script tag early", () => {
    const { container } = render(<JsonLd data={{ name: "</script><img onerror=x>" }} />);
    const script = container.querySelector("script");

    expect(script).toHaveAttribute("type", "application/ld+json");
    expect(script?.innerHTML).not.toContain("</script>");
    expect(JSON.parse(script?.textContent ?? "{}")).toEqual({ name: "</script><img onerror=x>" });
  });
});

describe("Honeypot", () => {
  it("is out of the accessibility tree and out of the tab order", () => {
    const { container } = render(<Honeypot />);

    const wrapper = container.querySelector('div[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();

    const input = container.querySelector(`input[name="${HONEYPOT_FIELD}"]`);
    expect(input).not.toBeNull();
    expect(wrapper?.contains(input!)).toBe(true);
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveValue("");
  });

  it("is moved off screen rather than hidden, so a form filler still fills it", () => {
    const { container } = render(<Honeypot />);
    const wrapper = container.querySelector('div[aria-hidden="true"]');

    expect(wrapper?.className).toContain("left-[-9999px]");
    // display:none and visibility:hidden are the two a form filler skips.
    expect(wrapper?.className.split(" ")).not.toContain("hidden");
    expect(wrapper).toBeVisible();
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

  it("shows sign in links when logged out and the account menu when logged in", () => {
    const { unmount } = render(
      <HeaderBar username={null} avatarUrl={null} shieldEnabled={false} shieldProgress={0} />,
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Account/ })).not.toBeInTheDocument();
    unmount();

    render(<HeaderBar username="mara" avatarUrl={null} shieldEnabled={false} shieldProgress={0} />);
    expect(screen.getByRole("button", { name: "Account: mara" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
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

    const { rerender } = render(<NavRail groups={[group]} signedIn isAdmin={false} />);
    const rail = screen.getByRole("navigation", { name: "Primary" });
    expect(within(rail).getByRole("link", { name: "Vice City locals" })).toBeInTheDocument();

    rerender(<NavRail groups={[]} signedIn={false} isAdmin={false} />);
    expect(screen.queryByText("Your groups")).not.toBeInTheDocument();
  });

  it("shows the admin link only to an admin", () => {
    const { rerender } = render(<NavRail groups={[]} signedIn isAdmin={false} />);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();

    rerender(<NavRail groups={[]} signedIn isAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("says so when a signed in person has no groups", () => {
    render(<NavRail groups={[]} signedIn isAdmin={false} />);
    expect(screen.getByText("None yet.")).toBeInTheDocument();
  });

  it("gives the bottom bar four destinations", () => {
    render(<BottomBar />);
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link")).toHaveLength(4);
  });

  it("renders the shell with and without a context column", () => {
    const { rerender } = render(
      <AppShell groups={[]} isAdmin={false} username={null} avatarUrl={null} shield={{ enabled: false, progress: 0 }} context={<p>Context here</p>}>
        <p>Main content</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: "Context" })).toHaveTextContent("Context here");

    rerender(
      <AppShell groups={[]} isAdmin={false} username={null} avatarUrl={null} shield={{ enabled: false, progress: 0 }}>
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

describe("UserMenu", () => {
  it("keeps the menu shut until asked", () => {
    render(<UserMenu username="mara" avatarUrl={null} />);

    const trigger = screen.getByRole("button", { name: "Account: mara" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers the profile, settings, and a way out", async () => {
    render(<UserMenu username="mara" avatarUrl={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Account: mara" }));

    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: "Your profile" })).toHaveAttribute("href", "/u/mara");
    expect(within(menu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("submits the sign out action rather than navigating", async () => {
    render(<UserMenu username="mara" avatarUrl={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Account: mara" }));

    const signOutButton = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOutButton).toHaveAttribute("type", "submit");
    expect(signOutButton.closest("form")).not.toBeNull();
  });

  it("closes on Escape", async () => {
    render(<UserMenu username="mara" avatarUrl={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Account: mara" }));

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

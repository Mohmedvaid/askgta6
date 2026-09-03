import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const revealContent = vi.fn();
const castVote = vi.fn();
const submitReport = vi.fn();
const createReply = vi.fn();
const moderate = vi.fn();
const track = vi.fn();

vi.mock("@/actions/reveal", () => ({ revealContent }));
vi.mock("@/actions/votes", () => ({ castVote }));
vi.mock("@/actions/reports", () => ({ submitReport }));
vi.mock("@/actions/replies", () => ({ createReply }));
vi.mock("@/actions/moderation", () => ({ moderate }));
vi.mock("@/lib/analytics", () => ({ track }));

const { RevealRegion } = await import("@/components/post/RevealRegion");
const { VoteControl } = await import("@/components/post/VoteControl");
const { ReportDialog } = await import("@/components/form/ReportDialog");
const { ReplyComposer } = await import("@/components/form/ReplyComposer");
const { ModerationRow } = await import("@/components/ModerationRow");
const { ReplyItem } = await import("@/components/reply/ReplyItem");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RevealRegion", () => {
  it("names the level it is sealed behind, then shows the body once asked", async () => {
    revealContent.mockResolvedValue({ ok: true, data: { title: null, body: "<p>Hidden body.</p>" } });

    render(<RevealRegion target={{ type: "post", id: "post-1" }} variant="card" spoilerLevel={5} />);
    expect(screen.getByText("Body hidden until Chapter 5")).toBeInTheDocument();
    expect(screen.queryByText("Hidden body.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reveal anyway" }));

    expect(await screen.findByText("Hidden body.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal anyway" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Body hidden until/)).not.toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("reveal_clicked", { target: "post", spoiler_level: 5 });
  });

  it("renders a reply reveal with no heading", async () => {
    revealContent.mockResolvedValue({ ok: true, data: { title: null, body: "<p>Just a body.</p>" } });

    render(<RevealRegion target={{ type: "reply", id: "reply-1" }} variant="card" spoilerLevel={3} />);
    await userEvent.click(screen.getByRole("button", { name: "Reveal anyway" }));

    expect(await screen.findByText("Just a body.")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("keeps the placeholder and explains when the reveal fails", async () => {
    revealContent.mockResolvedValue({ ok: false, error: "That post is no longer available." });

    render(<RevealRegion target={{ type: "post", id: "gone" }} variant="full" spoilerLevel={7} />);
    await userEvent.click(screen.getByRole("button", { name: "Reveal anyway" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That post is no longer available.");
    expect(screen.getByRole("button", { name: "Reveal anyway" })).toBeInTheDocument();
    expect(screen.getByText("Body hidden until Finished")).toBeInTheDocument();
  });
});

describe("VoteControl", () => {
  it("sends the vote and shows the new total", async () => {
    castVote.mockResolvedValue({ ok: true, data: 6 });

    render(<VoteControl targetType="post" targetId="post-1" count={5} myVote={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Upvote" }));

    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(castVote).toHaveBeenCalledWith({ targetType: "post", targetId: "post-1", value: 1 });
  });

  it("clears a vote when the same arrow is pressed again", async () => {
    castVote.mockResolvedValue({ ok: true, data: 4 });

    render(<VoteControl targetType="reply" targetId="reply-1" count={5} myVote={1} layout="row" />);
    expect(screen.getByRole("button", { name: "Upvote" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Upvote" }));
    expect(castVote).toHaveBeenCalledWith({ targetType: "reply", targetId: "reply-1", value: 0 });
    expect(await screen.findByText("4")).toBeInTheDocument();
  });

  it("leaves the count alone when the vote is rejected", async () => {
    castVote.mockResolvedValue({ ok: false, error: "Sign in to vote." });

    render(<VoteControl targetType="post" targetId="post-1" count={5} myVote={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Downvote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to vote.");
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("ReportDialog", () => {
  it("opens the form, sends it, and confirms", async () => {
    submitReport.mockResolvedValue({ ok: true, data: undefined });

    render(<ReportDialog targetType="post" targetId="post-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Report" }));

    expect(screen.getByLabelText("Why are you reporting this")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText(/Report filed/)).toBeInTheDocument();
  });

  it("closes again on cancel", async () => {
    render(<ReportDialog targetType="reply" targetId="reply-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Report" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("shows the error when the report is refused", async () => {
    submitReport.mockResolvedValue({ ok: false, error: "You already reported this." });

    render(<ReportDialog targetType="post" targetId="post-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Report" }));
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already reported this.");
  });
});

describe("ReplyComposer", () => {
  it("clears the textarea after a successful reply", async () => {
    createReply.mockResolvedValue({ ok: true, data: undefined });

    render(<ReplyComposer postId="post-1" defaultSpoilerLevel={2} />);
    const textarea = screen.getByLabelText("Your reply");
    await userEvent.type(textarea, "My answer.");
    await userEvent.click(screen.getByRole("button", { name: "Post reply" }));

    expect(await screen.findByLabelText("Your reply")).toHaveValue("");
  });

  it("keeps the draft and shows the error when the reply is refused", async () => {
    createReply.mockResolvedValue({ ok: false, error: "You are replying too quickly. Wait a minute and try again." });

    render(<ReplyComposer postId="post-1" defaultSpoilerLevel={0} />);
    await userEvent.type(screen.getByLabelText("Your reply"), "My answer.");
    await userEvent.click(screen.getByRole("button", { name: "Post reply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("replying too quickly");
    expect(screen.getByLabelText("Your reply")).toHaveValue("My answer.");
  });
});

describe("ModerationRow", () => {
  it("offers hide, unhide, and delete, and reports the outcome", async () => {
    moderate.mockResolvedValue({ ok: true, data: undefined });

    render(<ModerationRow targetType="post" targetId="post-1" />);
    expect(screen.getByRole("button", { name: "hide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unhide" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });

  it("shows the refusal when the caller is not an admin", async () => {
    moderate.mockResolvedValue({ ok: false, error: "That action is not available to you." });

    render(<ModerationRow targetType="reply" targetId="reply-1" />);
    await userEvent.click(screen.getByRole("button", { name: "hide" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("not available to you");
  });
});

describe("ReplyItem", () => {
  const reply = {
    hidden: false as const,
    id: "reply-1",
    post_id: "post-1",
    author_id: "bbbb",
    body: "The map is bigger than it looks.",
    spoiler_level: 0,
    vote_count: 2,
    is_hidden: false,
    created_at: new Date().toISOString(),
    author: { username: "june", display_name: null, avatar_path: null },
  };

  const noop = async () => undefined;

  it("shows the body, the author, and the accept control for the post author", () => {
    render(
      <ReplyItem reply={reply} myVote={0} accepted={false} canAccept isAuthor={false} acceptAction={noop} deleteAction={noop} />,
    );
    expect(screen.getByText("The map is bigger than it looks.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "june" })).toHaveAttribute("href", "/u/june");
    expect(screen.getByRole("button", { name: "Mark as answer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("marks the accepted answer and offers to unmark it", () => {
    render(
      <ReplyItem reply={reply} myVote={1} accepted canAccept isAuthor acceptAction={noop} deleteAction={noop} />,
    );
    expect(screen.getByText("Accepted answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmark answer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows the placeholder for a gated reply", () => {
    const hidden = {
      hidden: true as const,
      id: "reply-2",
      post_id: "post-1",
      author_id: "bbbb",
      spoiler_level: 4,
      vote_count: 0,
      is_hidden: false,
      created_at: new Date().toISOString(),
      author: { username: "june", display_name: null, avatar_path: null },
    };

    render(
      <ReplyItem reply={hidden} myVote={0} accepted={false} canAccept={false} isAuthor={false} acceptAction={noop} deleteAction={noop} />,
    );
    expect(screen.getByRole("button", { name: "Reveal anyway" })).toBeInTheDocument();
    expect(screen.getByText("Body hidden until Chapter 4")).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createPost = vi.fn();
const createGroup = vi.fn();
const createInvite = vi.fn();
const redeemInvite = vi.fn();
const saveProfile = vi.fn();
const setProgress = vi.fn();
const uploadAvatar = vi.fn();
const completeOnboarding = vi.fn();
const dismissProgressPrompt = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();
const sendMagicLink = vi.fn();
const push = vi.fn();
const track = vi.fn();

vi.mock("@/actions/groups", () => ({ createGroup, createInvite, redeemInvite }));
vi.mock("@/actions/profile", () => ({ saveProfile, setProgress, uploadAvatar, dismissProgressPrompt, setTheme: vi.fn() }));
vi.mock("@/actions/onboarding", () => ({ completeOnboarding }));
vi.mock("@/app/auth/actions", () => ({ signIn, signUp, sendMagicLink, signInWithProvider: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/analytics", () => ({ track }));

const { PostComposer } = await import("@/components/form/PostComposer");
const { ProfileForm } = await import("@/components/form/ProfileForm");
const { AvatarForm } = await import("@/components/form/AvatarForm");
const { OnboardingForm } = await import("@/components/form/OnboardingForm");
const { AuthForm } = await import("@/components/form/AuthForm");
const { GroupComposer } = await import("@/components/group/GroupComposer");
const { InvitePanel } = await import("@/components/group/InvitePanel");
const { PrivateGroupGate } = await import("@/components/group/PrivateGroupGate");
const { ProgressPanel } = await import("@/components/shell/ProgressPanel");
const { ProgressSheet } = await import("@/components/shell/ProgressSheet");

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillPost() {
  await userEvent.type(screen.getByLabelText("Title"), "How big is the Leonida map");
  await userEvent.type(screen.getByLabelText("Body"), "Trailer two shows a lot of coastline.");
}

describe("PostComposer", () => {
  it("offers the kind toggle when writing and hides it when editing", () => {
    const { unmount } = render(
      <PostComposer action={createPost} defaults={{ spoilerLevel: 0 }} submitLabel="Publish" />,
    );
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
    unmount();

    render(
      <PostComposer
        action={createPost}
        defaults={{ postId: "p1", title: "A title", body: "A body", topic: "map", spoilerLevel: 3 }}
        submitLabel="Save changes"
      />,
    );
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("A title");
    expect(screen.getByText("Chapter 3")).toBeInTheDocument();
  });

  it("reports the shape of a new post, and nothing a reader wrote", async () => {
    createPost.mockResolvedValue({ ok: true, data: undefined });

    render(<PostComposer action={createPost} defaults={{ spoilerLevel: 2 }} submitLabel="Publish" />);
    await fillPost();
    await userEvent.selectOptions(screen.getByLabelText("Topic"), "vehicles");
    await userEvent.click(screen.getByLabelText("Discussion"));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(track).toHaveBeenCalledWith("post_created", {
      kind: "discussion",
      topic: "vehicles",
      spoiler_level: 2,
      in_group: false,
    });
    const payload = JSON.stringify(track.mock.calls);
    expect(payload).not.toContain("Leonida");
    expect(payload).not.toContain("coastline");
  });

  it("sends no post_created event when editing an existing post", async () => {
    createPost.mockResolvedValue({ ok: true, data: undefined });

    render(
      <PostComposer
        action={createPost}
        defaults={{ postId: "p1", title: "A title", body: "A body", topic: "map", spoilerLevel: 0 }}
        submitLabel="Save changes"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(track).not.toHaveBeenCalled();
  });

  it("keeps the draft when the server rejects the post", async () => {
    createPost.mockResolvedValue({ ok: false, error: "You are posting too quickly. Wait a minute and try again." });

    render(<PostComposer action={createPost} defaults={{ spoilerLevel: 0 }} submitLabel="Publish" />);
    await fillPost();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("posting too quickly");
    expect(screen.getByLabelText("Title")).toHaveValue("How big is the Leonida map");
    expect(screen.getByLabelText("Body")).toHaveValue("Trailer two shows a lot of coastline.");
  });

  it("carries the group id through as a hidden field", () => {
    const { container } = render(
      <PostComposer action={createPost} defaults={{ spoilerLevel: 0, groupId: "g1" }} submitLabel="Publish" />,
    );
    expect(container.querySelector('input[name="groupId"]')).toHaveValue("g1");
  });

  it("lets the author change the topic", async () => {
    render(<PostComposer action={createPost} defaults={{ spoilerLevel: 0 }} submitLabel="Publish" />);
    await userEvent.selectOptions(screen.getByLabelText("Topic"), "vehicles");
    expect(screen.getByLabelText("Topic")).toHaveValue("vehicles");
  });
});

describe("ProfileForm", () => {
  it("confirms a save and shows a taken username", async () => {
    saveProfile.mockResolvedValue({ ok: true, data: undefined });
    const { unmount } = render(<ProfileForm username="mara" displayName="Mara" />);
    expect(screen.getByLabelText("Username")).toHaveValue("mara");

    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    unmount();

    saveProfile.mockResolvedValue({ ok: false, error: "That username is taken." });
    render(<ProfileForm username="mara" displayName={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is taken.");
  });
});

describe("AvatarForm", () => {
  it("confirms an upload and reports a rejection", async () => {
    uploadAvatar.mockResolvedValue({ ok: true, data: undefined });
    const { unmount } = render(<AvatarForm username="mara" url={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Avatar updated.")).toBeInTheDocument();
    unmount();

    uploadAvatar.mockResolvedValue({ ok: false, error: "Avatars are capped at 2 MB." });
    render(<AvatarForm username="mara" url="https://cdn.test/a.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("capped at 2 MB");
  });
});

describe("OnboardingForm", () => {
  it("sends the reader to the feed once the name is saved", async () => {
    completeOnboarding.mockResolvedValue({ ok: true, data: undefined });

    render(<OnboardingForm progress={0} />);
    await userEvent.type(screen.getByLabelText("Username"), "mara");
    await userEvent.click(screen.getByRole("button", { name: "Start reading" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/feed"));
    expect(track).toHaveBeenCalledWith("signup_completed", { method: "password" });
    expect(track).toHaveBeenCalledWith("progress_set", { level: 0, source: "onboarding" });
  });

  it("stays put and explains when the name is taken", async () => {
    completeOnboarding.mockResolvedValue({ ok: false, error: "That username is taken." });

    render(<OnboardingForm progress={0} />);
    await userEvent.type(screen.getByLabelText("Username"), "mara");
    await userEvent.click(screen.getByRole("button", { name: "Start reading" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That username is taken.");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("AuthForm", () => {
  it("shows the sign in copy and links across", () => {
    render(<AuthForm mode="sign-in" discordEnabled={false} googleEnabled={false} />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.queryByRole("button", { name: /Discord/ })).not.toBeInTheDocument();
  });

  it("renders provider buttons only when the flags are on", () => {
    render(<AuthForm mode="sign-up" discordEnabled googleEnabled />);
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("reports a failed sign in", async () => {
    signIn.mockResolvedValue({ ok: false, error: "That email and password do not match an account." });

    render(<AuthForm mode="sign-in" next="/settings" discordEnabled={false} googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("do not match an account");
  });

  it("confirms a sent magic link", async () => {
    sendMagicLink.mockResolvedValue({ ok: true, data: undefined });

    render(<AuthForm mode="sign-in" discordEnabled={false} googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Or get a sign in link"), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByText("Link sent. Check your inbox.")).toBeInTheDocument();
  });

  it("confirms a new account that needs email confirmation", async () => {
    signUp.mockResolvedValue({ ok: true, data: undefined });

    render(<AuthForm mode="sign-up" discordEnabled={false} googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
  });
});

describe("group forms", () => {
  it("defaults a new group to public and reports a failure", async () => {
    createGroup.mockResolvedValue({ ok: false, error: "That name is taken. Try another one." });

    render(<GroupComposer />);
    expect(screen.getByLabelText("Public")).toBeChecked();

    await userEvent.type(screen.getByLabelText("Name"), "Night shift");
    await userEvent.click(screen.getByLabelText("Private"));
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That name is taken.");
  });

  it("says when a private group has no invite links yet", () => {
    const group = {
      id: "g1",
      slug: "night-shift",
      name: "Night shift",
      description: null,
      visibility: "private" as const,
      owner_id: "u1",
      member_count: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    };

    const { rerender } = render(<InvitePanel group={group} invites={[]} />);
    expect(screen.getByText(/No links yet/)).toBeInTheDocument();

    rerender(<InvitePanel group={group} invites={[{ id: "i1", code: "NIGHTRUN", expires_at: null }]} />);
    expect(screen.getByText("/g/join/NIGHTRUN")).toBeInTheDocument();
  });

  it("takes an invite code on the private group gate", async () => {
    redeemInvite.mockResolvedValue({ ok: false, error: "That invite code is not valid." });

    render(<PrivateGroupGate />);
    expect(screen.getByRole("heading", { name: "This group is private" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Invite code"), "NOPE1234");
    await userEvent.click(screen.getByRole("button", { name: "Join group" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("not valid");
  });
});

describe("ProgressPanel", () => {
  it("saves the level the reader picked", async () => {
    setProgress.mockResolvedValue({ ok: false, error: "Your progress could not be saved." });

    render(<ProgressPanel progress={2} />);
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save progress" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(track).not.toHaveBeenCalled();
  });

  it("reports the level once the save comes back ok", async () => {
    setProgress.mockResolvedValue({ ok: true, data: undefined });

    render(<ProgressPanel progress={2} />);
    fireEvent.change(screen.getByRole("slider", { name: "How far you have played" }), { target: { value: "5" } });
    await userEvent.click(screen.getByRole("button", { name: "Save progress" }));

    await vi.waitFor(() => expect(track).toHaveBeenCalledWith("progress_set", { level: 5, source: "settings" }));
  });
});

describe("ProgressSheet", () => {
  it("opens itself for a visitor who has never been asked", () => {
    render(<ProgressSheet progress={0} promptOnLoad />);

    expect(screen.getByRole("dialog", { name: "Where are you in the story?" })).toBeInTheDocument();
    expect(screen.getByText("Haven't played")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("stays shut for a reader who already answered, behind a trigger", async () => {
    render(<ProgressSheet progress={3} promptOnLoad={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Level: Chapter 3" });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Where are you in the story?" })).toBeInTheDocument();
  });

  it("records level 0 when the visitor walks away from the question", async () => {
    render(<ProgressSheet progress={0} promptOnLoad />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(dismissProgressPrompt).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not record anything when a returning reader just closes it", async () => {
    render(<ProgressSheet progress={4} promptOnLoad={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Level: Chapter 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(dismissProgressPrompt).not.toHaveBeenCalled();
  });

  it("saves the level, closes, and reports it", async () => {
    setProgress.mockResolvedValue({ ok: true, data: undefined });

    render(<ProgressSheet progress={0} promptOnLoad />);
    fireEvent.change(screen.getByRole("slider", { name: "How far you have played" }), { target: { value: "5" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(track).toHaveBeenCalledWith("progress_set", { level: 5, source: "settings" });
  });

  it("keeps the sheet open and explains when the save fails", async () => {
    setProgress.mockResolvedValue({ ok: false, error: "Your progress could not be saved." });

    render(<ProgressSheet progress={0} promptOnLoad />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

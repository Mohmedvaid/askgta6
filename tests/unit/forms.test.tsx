import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createPost = vi.fn();
const createGroup = vi.fn();
const createInvite = vi.fn();
const redeemInvite = vi.fn();
const saveProfile = vi.fn();
const setSpoilerShield = vi.fn();
const uploadAvatar = vi.fn();
const completeOnboarding = vi.fn();
const refresh = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();
const sendMagicLink = vi.fn();
const requestPasswordReset = vi.fn();
const updatePassword = vi.fn();
const push = vi.fn();
const track = vi.fn();

vi.mock("@/actions/groups", () => ({ createGroup, createInvite, redeemInvite }));
vi.mock("@/actions/profile", () => ({ saveProfile, setSpoilerShield, uploadAvatar, setTheme: vi.fn() }));
vi.mock("@/actions/onboarding", () => ({ completeOnboarding }));
vi.mock("@/app/auth/actions", () => ({
  signIn,
  signUp,
  sendMagicLink,
  requestPasswordReset,
  updatePassword,
  signInWithProvider: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/analytics", () => ({ track }));

const { PostComposer } = await import("@/components/form/PostComposer");
const { ProfileForm } = await import("@/components/form/ProfileForm");
const { AvatarForm } = await import("@/components/form/AvatarForm");
const { OnboardingForm } = await import("@/components/form/OnboardingForm");
const { ForgotPasswordForm } = await import("@/components/form/ForgotPasswordForm");
const { ResetPasswordForm } = await import("@/components/form/ResetPasswordForm");
const { AuthForm } = await import("@/components/form/AuthForm");
const { GroupComposer } = await import("@/components/group/GroupComposer");
const { InvitePanel } = await import("@/components/group/InvitePanel");
const { PrivateGroupGate } = await import("@/components/group/PrivateGroupGate");
const { ShieldControls } = await import("@/components/shell/ShieldControls");
const { ShieldPill } = await import("@/components/shell/ShieldPill");

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

    render(<OnboardingForm />);
    await userEvent.type(screen.getByLabelText("Username"), "mara");
    await userEvent.click(screen.getByRole("button", { name: "Start reading" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/feed"));
    expect(track).toHaveBeenCalledWith("signup_completed", { method: "password" });
  });

  it("stays put and explains when the name is taken", async () => {
    completeOnboarding.mockResolvedValue({ ok: false, error: "That username is taken." });

    render(<OnboardingForm />);
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

  it("offers no magic link form while that method is disabled", () => {
    const { container } = render(<AuthForm mode="sign-in" discordEnabled={false} googleEnabled={false} />);

    // One form, one email field, and no way to ask for a link.
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(screen.getAllByLabelText("Email")).toHaveLength(1);
    expect(screen.queryByLabelText(/sign in link/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /link/i })).toBeNull();
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("offers a way to the forgot password page when signing in, and not when signing up", () => {
    const { unmount } = render(<AuthForm mode="sign-in" discordEnabled={false} googleEnabled={false} />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/auth/forgot");
    unmount();

    render(<AuthForm mode="sign-up" discordEnabled={false} googleEnabled={false} />);
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
  });

  it("keeps both OAuth buttons when their flags are on", () => {
    render(<AuthForm mode="sign-in" discordEnabled googleEnabled />);

    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
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



describe("ShieldControls", () => {
  it("says the shield is off and offers no chapter list until it is on", () => {
    render(<ShieldControls enabled={false} progress={0} source="settings" />);

    expect(screen.getByRole("switch", { name: "Spoiler shield" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/You see every post and reply in full/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chapter 3" })).not.toBeInTheDocument();
  });

  it("shows every chapter and marks the current one once the shield is on", () => {
    render(<ShieldControls enabled progress={3} source="settings" />);

    expect(screen.getByRole("switch", { name: "Spoiler shield" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Chapter 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Finished" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/third act/)).toBeInTheDocument();
  });

  it("turns the shield on, keeping the level it already had", async () => {
    setSpoilerShield.mockResolvedValue({ ok: true, data: undefined });

    render(<ShieldControls enabled={false} progress={4} source="header" />);
    await userEvent.click(screen.getByRole("switch", { name: "Spoiler shield" }));

    await vi.waitFor(() => expect(setSpoilerShield).toHaveBeenCalled());
    const sent = setSpoilerShield.mock.calls[0]![1] as FormData;
    expect(sent.get("enabled")).toBe("true");
    expect(sent.get("progress")).toBe("4");
    expect(track).toHaveBeenCalledWith("progress_set", { level: 4, shield: true, source: "header" });
  });

  it("picks a chapter and refreshes so the feed re-gates without a reload", async () => {
    setSpoilerShield.mockResolvedValue({ ok: true, data: undefined });

    render(<ShieldControls enabled progress={1} source="settings" />);
    await userEvent.click(screen.getByRole("button", { name: "Chapter 5" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = setSpoilerShield.mock.calls[0]![1] as FormData;
    expect(sent.get("enabled")).toBe("true");
    expect(sent.get("progress")).toBe("5");
  });

  it("reports a failed save and does not refresh", async () => {
    setSpoilerShield.mockResolvedValue({ ok: false, error: "Your spoiler shield could not be saved." });

    render(<ShieldControls enabled={false} progress={0} source="settings" />);
    await userEvent.click(screen.getByRole("switch", { name: "Spoiler shield" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("ShieldPill", () => {
  it("reads as off when the shield is off", () => {
    render(<ShieldPill enabled={false} progress={0} />);
    expect(screen.getByRole("button", { name: /Spoiler shield/ })).toHaveTextContent("off");
  });

  it("names the chapter when the shield is on", () => {
    render(<ShieldPill enabled progress={6} />);
    expect(screen.getByRole("button", { name: /Spoiler shield/ })).toHaveTextContent("Chapter 6");
  });

  it("opens and closes the popover", async () => {
    render(<ShieldPill enabled={false} progress={0} />);

    const pill = screen.getByRole("button", { name: /Spoiler shield/ });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(pill);
    expect(screen.getByRole("dialog", { name: "Spoiler shield" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Spoiler shield" })).toBeInTheDocument();

    await userEvent.click(pill);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<ShieldPill enabled progress={2} />);
    await userEvent.click(screen.getByRole("button", { name: /Spoiler shield/ }));

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes once a save lands, so the popover does not sit over the refreshed feed", async () => {
    setSpoilerShield.mockResolvedValue({ ok: true, data: undefined });

    render(<ShieldPill enabled={false} progress={0} />);
    await userEvent.click(screen.getByRole("button", { name: /Spoiler shield/ }));
    await userEvent.click(screen.getByRole("switch", { name: "Spoiler shield" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("ShieldPill accessible name", () => {
  it("spells out the state, because the visible label is hidden on small screens", () => {
    const { unmount } = render(<ShieldPill enabled={false} progress={0} />);
    expect(screen.getByRole("button", { name: "Spoiler shield: off" })).toBeInTheDocument();
    unmount();

    render(<ShieldPill enabled progress={7} />);
    expect(screen.getByRole("button", { name: "Spoiler shield: Finished" })).toBeInTheDocument();
  });
});

describe("ForgotPasswordForm", () => {
  it("says the same thing whatever the address was", async () => {
    requestPasswordReset.mockResolvedValue({ ok: true, data: undefined });

    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));

    // "If that address has an account" is the whole point. It never confirms one.
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText(/If that address has an account/)).toBeInTheDocument();
  });

  it("carries the honeypot, and no error state to read a failure off", () => {
    const { container } = render(<ForgotPasswordForm />);

    expect(container.querySelector('input[name="website"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ResetPasswordForm", () => {
  it("reports two passwords that do not match", async () => {
    updatePassword.mockResolvedValue({ ok: false, error: "Those two passwords do not match." });

    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "a-new-password");
    await userEvent.type(screen.getByLabelText("Confirm it"), "something-else");
    await userEvent.click(screen.getByRole("button", { name: "Save password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
  });
});

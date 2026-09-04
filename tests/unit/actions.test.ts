import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };
const viewer: { current: unknown } = { current: null };
const adminHolder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

vi.mock("@/lib/viewer", () => ({
  getViewer: async () => viewer.current,
  getViewerProgress: async () => 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => adminHolder.client,
}));

// Turnstile is off in these tests, which is the shipped default. Its own file
// covers the enabled path.
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: async () => ({ ok: true }),
}));

// The spam filter and the link gate have their own files. Here they are stubbed so
// the tests below are about the action, and flipped where the wiring is the point.
const spam = { verdict: { spam: false } as { spam: boolean; rule?: string; note?: string }, quarantined: [] as unknown[] };

vi.mock("@/lib/spam", () => ({
  checkSpam: async () => spam.verdict,
  quarantine: async (...args: unknown[]) => {
    spam.quarantined.push(args);
  },
}));

const links = { allowed: true };

vi.mock("@/lib/link-privilege", () => ({
  checkLinkPrivilege: async () => (links.allowed ? { allowed: true } : { allowed: false, reason: "no links yet" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { revealContent } = await import("@/actions/reveal");
const { castVote, getMyVote } = await import("@/actions/votes");
const { createPost, editPost } = await import("@/actions/posts");
const { createReply } = await import("@/actions/replies");
const { submitReport } = await import("@/actions/reports");
const { HONEYPOT_FIELD } = await import("@/lib/honeypot");
const { createGroup, redeemInvite } = await import("@/actions/groups");
const { saveProfile, setSpoilerShield, uploadAvatar } = await import("@/actions/profile");
const { completeOnboarding } = await import("@/actions/onboarding");
const { adminEditProfile, deleteAccount, editBlockList, moderate, setBanned } = await import(
  "@/actions/admin"
);

const UUID = "8b2f0f7a-1111-4222-8333-444455556666";
const SIGNED_IN = {
  userId: "user-1",
  username: "mara",
  displayName: null,
  avatarPath: null,
  progress: 2,
  shieldEnabled: false,
  theme: "dark",
  isAdmin: false,
  bannedAt: null,
};

const ADMIN = { ...SIGNED_IN, isAdmin: true };
const OTHER_USER = "9c3f0f7a-2222-4333-8444-555566667777";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function validPost(overrides: Record<string, string> = {}) {
  return form({
    title: "How big is the Leonida map",
    body: "Trailer two shows a lot of coastline.",
    topic: "map",
    kind: "question",
    spoilerLevel: "0",
    ...overrides,
  });
}

/** Captures the url a server action redirects to. */
async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  holder.client = createFakeClient();
  adminHolder.client = createFakeClient();
  viewer.current = null;
  spam.verdict = { spam: false };
  spam.quarantined = [];
  links.allowed = true;
});

describe("revealContent", () => {
  it("returns rendered markdown for a post", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: { id: UUID, spoiler_level: 4, title: "The hidden title", body: "Hidden **body**.", author: {} },
          error: null,
        },
      },
    });

    const result = await revealContent({ type: "post", id: UUID });
    expect(result).toEqual({ ok: true, data: { title: "The hidden title", body: "<p>Hidden <strong>body</strong>.</p>" } });
  });

  it("returns a body with no title for a reply", async () => {
    holder.client = createFakeClient({
      tables: { replies: { data: { id: UUID, spoiler_level: 3, body: "Just a body.", author: {} }, error: null } },
    });

    const result = await revealContent({ type: "reply", id: UUID });
    expect(result).toEqual({ ok: true, data: { title: null, body: "<p>Just a body.</p>" } });
  });

  it("refuses a malformed target and a missing row", async () => {
    expect(await revealContent({ type: "post", id: "not-a-uuid" })).toEqual({
      ok: false,
      error: "That item could not be revealed.",
    });
    expect(await revealContent(null)).toMatchObject({ ok: false });

    holder.client = createFakeClient({ tables: { posts: { data: null, error: null } } });
    expect(await revealContent({ type: "post", id: UUID })).toEqual({
      ok: false,
      error: "That post is no longer available.",
    });

    holder.client = createFakeClient({ tables: { replies: { data: null, error: null } } });
    expect(await revealContent({ type: "reply", id: UUID })).toEqual({
      ok: false,
      error: "That reply is no longer available.",
    });
  });
});

describe("createPost", () => {
  it("refuses a signed out author", async () => {
    expect(await createPost(null, validPost())).toEqual({ ok: false, error: "Sign in to post." });
  });

  it("returns the first validation message", async () => {
    viewer.current = SIGNED_IN;
    const result = await createPost(null, validPost({ title: "Short" }));
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/at least 8/);
  });

  it("redirects to the new post on success", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ tables: { posts: { data: { id: UUID }, error: null } } });
    expect(await captureRedirect(() => createPost(null, validPost()))).toBe(`/p/${UUID}`);
  });

  it("translates the rate limit into plain english", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({
      tables: { posts: { data: null, error: { message: "rate limit: too many posts in the last minute" } } },
    });

    expect(await createPost(null, validPost())).toEqual({
      ok: false,
      error: "You are posting too quickly. Wait a minute and try again.",
    });
  });

  it("translates a row level security refusal", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({
      tables: { posts: { data: null, error: { message: 'new row violates row-level security policy' } } },
    });

    expect(await createPost(null, validPost({ groupId: UUID }))).toEqual({
      ok: false,
      error: "You cannot post in that group.",
    });
  });
});

describe("editPost", () => {
  it("requires a signed in author and a post id", async () => {
    expect(await editPost(null, validPost({ postId: UUID }))).toEqual({ ok: false, error: "Sign in to edit." });

    viewer.current = SIGNED_IN;
    expect(await editPost(null, validPost({ postId: "nope" }))).toMatchObject({ ok: false });
  });

  it("redirects back to the post after saving", async () => {
    viewer.current = SIGNED_IN;
    expect(await captureRedirect(() => editPost(null, validPost({ postId: UUID })))).toBe(`/p/${UUID}`);
  });
});

describe("replies", () => {
  it("refuses a signed out author and bad input", async () => {
    expect(await createReply(null, form({ postId: UUID, body: "Yes.", spoilerLevel: "0" }))).toEqual({
      ok: false,
      error: "Sign in to reply.",
    });

    viewer.current = SIGNED_IN;
    expect(await createReply(null, form({ postId: UUID, body: "", spoilerLevel: "0" }))).toMatchObject({ ok: false });
  });

  it("saves a reply and translates the rate limit", async () => {
    viewer.current = SIGNED_IN;
    expect(await createReply(null, form({ postId: UUID, body: "Yes.", spoilerLevel: "0" }))).toEqual({
      ok: true,
      data: undefined,
    });

    holder.client = createFakeClient({
      tables: { replies: { data: null, error: { message: "rate limit: too many replies" } } },
    });
    expect(await createReply(null, form({ postId: UUID, body: "Yes.", spoilerLevel: "0" }))).toEqual({
      ok: false,
      error: "You are replying too quickly. Wait a minute and try again.",
    });
  });
});

describe("votes", () => {
  it("refuses a signed out voter and returns the new total", async () => {
    expect(await castVote({ targetType: "post", targetId: UUID, value: 1 })).toEqual({
      ok: false,
      error: "Sign in to vote.",
    });

    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ rpc: { cast_vote: { data: 7, error: null } } });
    expect(await castVote({ targetType: "post", targetId: UUID, value: 1 })).toEqual({ ok: true, data: 7 });

    holder.client = createFakeClient({ rpc: { cast_vote: { data: null, error: { message: "nope" } } } });
    expect(await castVote({ targetType: "post", targetId: UUID, value: 1 })).toEqual({
      ok: false,
      error: "That vote did not go through.",
    });

    expect(await castVote({ targetType: "post", targetId: UUID, value: 5 })).toMatchObject({ ok: false });
  });

  it("reads the caller's own vote and defaults to zero", async () => {
    expect(await getMyVote("post", UUID)).toBe(0);

    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ tables: { votes: { data: { value: -1 }, error: null } } });
    expect(await getMyVote("post", UUID)).toBe(-1);

    holder.client = createFakeClient({ tables: { votes: { data: null, error: null } } });
    expect(await getMyVote("reply", UUID)).toBe(0);
  });
});

describe("reports", () => {
  it("files a report, names a duplicate, and refuses when signed out", async () => {
    expect(await submitReport(null, form({ targetType: "post", targetId: UUID, reason: "spam" }))).toEqual({
      ok: false,
      error: "Sign in to report.",
    });

    viewer.current = SIGNED_IN;
    expect(await submitReport(null, form({ targetType: "post", targetId: UUID, reason: "leak", note: "n" }))).toEqual({
      ok: true,
      data: undefined,
    });

    expect(await submitReport(null, form({ targetType: "post", targetId: UUID, reason: "nope" }))).toMatchObject({
      ok: false,
    });

    holder.client = createFakeClient({
      tables: { reports: { data: null, error: { message: "duplicate", code: "23505" } } },
    });
    expect(await submitReport(null, form({ targetType: "post", targetId: UUID, reason: "spam" }))).toEqual({
      ok: false,
      error: "You already reported this.",
    });
  });
});

describe("groups", () => {
  it("refuses a signed out creator and a nameless group", async () => {
    expect(await createGroup(null, form({ name: "Night shift", visibility: "private" }))).toEqual({
      ok: false,
      error: "Sign in to create a group.",
    });

    viewer.current = SIGNED_IN;
    expect(await createGroup(null, form({ name: "N", visibility: "public" }))).toMatchObject({ ok: false });
    expect(await createGroup(null, form({ name: "!!!", visibility: "public" }))).toEqual({
      ok: false,
      error: "Pick a name with at least one letter or digit.",
    });
  });

  it("redirects to the new group", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ tables: { groups: { data: { slug: "night-shift" }, error: null } } });
    expect(await captureRedirect(() => createGroup(null, form({ name: "Night shift", visibility: "private" })))).toBe(
      "/g/night-shift",
    );
  });

  it("gives up on a taken slug after retrying", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({
      tables: { groups: { data: null, error: { message: "duplicate", code: "23505" } } },
    });
    expect(await createGroup(null, form({ name: "Night shift", visibility: "private" }))).toEqual({
      ok: false,
      error: "That name is taken. Try another one.",
    });
  });

  it("redeems an invite code and explains a bad one", async () => {
    expect(await redeemInvite(null, form({ code: "NIGHTRUN" }))).toEqual({
      ok: false,
      error: "Sign in to join a group.",
    });

    viewer.current = SIGNED_IN;
    expect(await redeemInvite(null, form({ code: "abc" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({ rpc: { join_group_by_invite: { data: "night-shift", error: null } } });
    expect(await captureRedirect(() => redeemInvite(null, form({ code: "nightrun" })))).toBe("/g/night-shift");

    holder.client = createFakeClient({
      rpc: { join_group_by_invite: { data: null, error: { message: "invite code has expired" } } },
    });
    expect(await redeemInvite(null, form({ code: "NIGHTRUN" }))).toEqual({
      ok: false,
      error: "That invite code has expired.",
    });

    holder.client = createFakeClient({
      rpc: { join_group_by_invite: { data: null, error: { message: "invite code not found" } } },
    });
    expect(await redeemInvite(null, form({ code: "NOPE1234" }))).toEqual({
      ok: false,
      error: "That invite code is not valid.",
    });
  });
});

describe("profile", () => {
  it("saves a profile and names a taken username", async () => {
    expect(await saveProfile(null, form({ username: "mara" }))).toEqual({
      ok: false,
      error: "Sign in to edit your profile.",
    });

    viewer.current = SIGNED_IN;
    expect(await saveProfile(null, form({ username: "mara", displayName: "Mara" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await saveProfile(null, form({ username: "No Spaces" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({
      tables: { profiles: { data: null, error: { message: "duplicate", code: "23505" } } },
    });
    expect(await saveProfile(null, form({ username: "taken" }))).toEqual({
      ok: false,
      error: "That username is taken.",
    });
  });

  it("writes the shield and its level for a signed in reader", async () => {
    viewer.current = SIGNED_IN;

    expect(await setSpoilerShield(null, form({ enabled: "true", progress: "3" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(holder.client.calls.find((call) => call.method === "update")?.args[0]).toEqual({
      progress: 3,
      spoiler_shield: true,
    });

    holder.client = createFakeClient();
    expect(await setSpoilerShield(null, form({ enabled: "false", progress: "3" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(holder.client.calls.find((call) => call.method === "update")?.args[0]).toEqual({
      progress: 3,
      spoiler_shield: false,
    });
  });

  it("refuses a level outside the list and reports a failed write", async () => {
    viewer.current = SIGNED_IN;
    expect(await setSpoilerShield(null, form({ enabled: "true", progress: "9" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({ tables: { profiles: { data: null, error: { message: "no" } } } });
    expect(await setSpoilerShield(null, form({ enabled: "true", progress: "3" }))).toEqual({
      ok: false,
      error: "Your spoiler shield could not be saved.",
    });
  });

  it("checks the avatar size and type before uploading", async () => {
    viewer.current = SIGNED_IN;

    const withFile = (file: File) => {
      const data = new FormData();
      data.append("avatar", file);
      return data;
    };

    expect(await uploadAvatar(null, new FormData())).toEqual({ ok: false, error: "Choose an image first." });
    expect(await uploadAvatar(null, withFile(new File([], "a.png", { type: "image/png" })))).toEqual({
      ok: false,
      error: "Choose an image first.",
    });
    expect(
      await uploadAvatar(null, withFile(new File(["x".repeat(3_000_000)], "a.png", { type: "image/png" }))),
    ).toEqual({ ok: false, error: "Avatars are capped at 2 MB." });
    expect(await uploadAvatar(null, withFile(new File(["x"], "a.tiff", { type: "image/tiff" })))).toEqual({
      ok: false,
      error: "Use a PNG, JPEG, WebP, or GIF image.",
    });

    expect(await uploadAvatar(null, withFile(new File(["x"], "a.png", { type: "image/png" })))).toEqual({
      ok: true,
      data: undefined,
    });

    holder.client = createFakeClient({ storage: { uploadError: true } });
    expect(await uploadAvatar(null, withFile(new File(["x"], "a.png", { type: "image/png" })))).toEqual({
      ok: false,
      error: "That image could not be uploaded.",
    });
  });

  it("refuses an avatar upload when signed out", async () => {
    const data = new FormData();
    data.append("avatar", new File(["x"], "a.png", { type: "image/png" }));
    expect(await uploadAvatar(null, data)).toEqual({ ok: false, error: "Sign in to change your avatar." });
  });
});

describe("onboarding", () => {
  it("saves the username only", async () => {
    expect(await completeOnboarding(null, form({ username: "mara" }))).toEqual({
      ok: false,
      error: "Sign in first.",
    });

    viewer.current = SIGNED_IN;
    expect(await completeOnboarding(null, form({ username: "mara" }))).toEqual({ ok: true, data: undefined });
    expect(holder.client.calls.find((call) => call.method === "update")?.args[0]).toEqual({ username: "mara" });
    expect(await completeOnboarding(null, form({ username: "no" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({
      tables: { profiles: { data: null, error: { message: "duplicate", code: "23505" } } },
    });
    expect(await completeOnboarding(null, form({ username: "taken" }))).toEqual({
      ok: false,
      error: "That username is taken.",
    });
  });
});

describe("moderation", () => {
  it("refuses a signed in reader whose profile does not carry is_admin", async () => {
    viewer.current = SIGNED_IN;
    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "hide" }))).toEqual({
      ok: false,
      error: "That action is not available to you.",
    });
    expect(adminHolder.client.calls).toHaveLength(0);
  });

  it("refuses a logged out visitor", async () => {
    viewer.current = null;
    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "hide" }))).toMatchObject({
      ok: false,
    });
  });

  it("hides through the definer function and deletes through the table", async () => {
    viewer.current = ADMIN;

    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "hide" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(adminHolder.client.calls.some((call) => call.method === "rpc" && call.args[0] === "set_hidden")).toBe(true);

    adminHolder.client = createFakeClient();
    expect(await moderate(null, form({ targetType: "reply", targetId: UUID, action: "delete" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(adminHolder.client.calls.some((call) => call.method === "delete")).toBe(true);
  });

  it("clears the reports and leaves the content alone when dismissing", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "dismiss" }))).toEqual({
      ok: true,
      data: undefined,
    });

    expect(adminHolder.client.calls).toContainEqual({ method: "from", args: ["reports"] });
    expect(adminHolder.client.calls.some((call) => call.method === "rpc")).toBe(false);
    expect(adminHolder.client.calls.some((call) => call.method === "from" && call.args[0] === "posts")).toBe(false);
  });

  it("writes an audit row naming the action and the target", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    await moderate(null, form({ targetType: "post", targetId: UUID, action: "hide" }));

    expect(adminHolder.client.calls).toContainEqual({ method: "from", args: ["admin_actions"] });
    const insert = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      actor_id: "user-1",
      action: "hide",
      target_type: "post",
      target_id: UUID,
    });
  });

  it("reports a failure and rejects an unknown action", async () => {
    viewer.current = ADMIN;

    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "burn" }))).toMatchObject({
      ok: false,
    });

    adminHolder.client = createFakeClient({ rpc: { set_hidden: { data: null, error: { message: "no" } } } });
    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "unhide" }))).toEqual({
      ok: false,
      error: "That item could not be updated.",
    });

    adminHolder.client = createFakeClient({ tables: { posts: { data: null, error: { message: "no" } } } });
    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "delete" }))).toEqual({
      ok: false,
      error: "That item could not be deleted.",
    });
  });
});

describe("banning", () => {
  it("refuses a non admin", async () => {
    viewer.current = SIGNED_IN;
    expect(await setBanned(null, form({ userId: OTHER_USER, action: "ban" }))).toEqual({
      ok: false,
      error: "That action is not available to you.",
    });
    expect(adminHolder.client.calls).toHaveLength(0);
  });

  it("writes the ban columns and an audit row carrying the reason", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({ tables: { profiles: { data: { is_admin: false }, error: null } } });

    expect(await setBanned(null, form({ userId: OTHER_USER, action: "ban", reason: "spam" }))).toEqual({
      ok: true,
      data: undefined,
    });

    const update = adminHolder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({ banned_reason: "spam" });
    expect((update?.args[0] as { banned_at: string }).banned_at).toBeTruthy();

    const insert = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({ action: "ban", target_type: "user", target_id: OTHER_USER });
    expect((insert?.args[0] as { detail: Record<string, unknown> }).detail).toEqual({ reason: "spam" });
  });

  it("clears both columns on an unban", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({ tables: { profiles: { data: { is_admin: false }, error: null } } });

    await setBanned(null, form({ userId: OTHER_USER, action: "unban" }));

    const update = adminHolder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ banned_at: null, banned_reason: null });
  });

  it("will not let an admin ban themselves out of the dashboard", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    expect(await setBanned(null, form({ userId: "user-1", action: "ban" }))).toMatchObject({ ok: false });
    expect(adminHolder.client.calls).toHaveLength(0);
  });

  it("refuses to ban another admin before the flag comes off", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({ tables: { profiles: { data: { is_admin: true }, error: null } } });

    expect(await setBanned(null, form({ userId: OTHER_USER, action: "ban" }))).toEqual({
      ok: false,
      error: "Take the admin flag off that account first.",
    });
    expect(adminHolder.client.calls.some((call) => call.method === "update")).toBe(false);
  });
});

describe("deleting an account", () => {
  it("refuses a non admin", async () => {
    viewer.current = SIGNED_IN;
    expect(await deleteAccount(null, form({ userId: OTHER_USER, confirm: "someone" }))).toEqual({
      ok: false,
      error: "That action is not available to you.",
    });
  });

  it("refuses when the typed username does not match", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({
      tables: { profiles: { data: { username: "dex", is_admin: false }, error: null } },
    });

    expect(await deleteAccount(null, form({ userId: OTHER_USER, confirm: "not-dex" }))).toEqual({
      ok: false,
      error: "That username does not match.",
    });
  });

  it("writes the audit row before the account is gone", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({
      tables: { profiles: { data: { username: "dex", is_admin: false }, error: null } },
    });

    expect(await deleteAccount(null, form({ userId: OTHER_USER, confirm: "dex" }))).toEqual({
      ok: true,
      data: undefined,
    });

    const insert = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({ action: "delete_account", target_type: "user", target_id: OTHER_USER });
    // The username is only readable before the row goes, which is why it is captured.
    expect((insert?.args[0] as { detail: { username: string } }).detail.username).toBe("dex");
  });
});

describe("the composer honeypot", () => {
  beforeEach(() => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ tables: { posts: { data: { id: UUID }, error: null } } });
  });

  it("writes no post and says nothing about why", async () => {
    const data = validPost();
    data.set(HONEYPOT_FIELD, "https://spam.example");

    expect(await createPost(null, data)).toEqual({ ok: false, error: "That post could not be saved." });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("writes no reply either", async () => {
    const data = new FormData();
    data.set("postId", UUID);
    data.set("body", "A reply a bot wrote.");
    data.set("spoilerLevel", "0");
    data.set(HONEYPOT_FIELD, "x");

    expect(await createReply(null, data)).toEqual({ ok: false, error: "That reply could not be saved." });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("lets a real post through with the field left alone", async () => {
    const data = validPost();
    data.set(HONEYPOT_FIELD, "");

    expect(await captureRedirect(() => createPost(null, data))).toBe(`/p/${UUID}`);
  });
});

describe("the link gate on the composers", () => {
  const linked = () => validPost({ body: "Everything is at https://example.com/thing right now." });

  it("refuses a post with a link from an account that has not earned them", async () => {
    viewer.current = SIGNED_IN;
    links.allowed = false;

    expect(await createPost(null, linked())).toEqual({ ok: false, error: "no links yet" });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("refuses a reply with a link the same way", async () => {
    viewer.current = SIGNED_IN;
    links.allowed = false;

    const data = new FormData();
    data.set("postId", UUID);
    data.set("body", "see https://example.com/thing");
    data.set("spoilerLevel", "0");

    expect(await createReply(null, data)).toMatchObject({ ok: false, error: "no links yet" });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("does not consult the gate at all for a post with no link in it", async () => {
    viewer.current = SIGNED_IN;
    links.allowed = false;
    holder.client = createFakeClient({ tables: { posts: { data: { id: UUID }, error: null } } });

    // The body has no link, so the privilege never comes up.
    expect(await captureRedirect(() => createPost(null, validPost()))).toBe(`/p/${UUID}`);
  });

  it("catches a link hidden in the title, not just the body", async () => {
    viewer.current = SIGNED_IN;
    links.allowed = false;

    const data = validPost({ title: "Look at https://example.com now" });
    expect(await createPost(null, data)).toMatchObject({ ok: false });
  });
});

describe("the spam filter on the composers", () => {
  it("saves the post and then hides it, rather than refusing", async () => {
    viewer.current = SIGNED_IN;
    spam.verdict = { spam: true, rule: "blocked_domain", note: "Blocked domain: bit.ly" };
    holder.client = createFakeClient({ tables: { posts: { data: { id: UUID }, error: null } } });

    // The author is redirected to their post as normal. It is hidden and reported.
    expect(await captureRedirect(() => createPost(null, validPost()))).toBe(`/p/${UUID}`);
    expect(spam.quarantined).toEqual([["post", UUID, "user-1", "Blocked domain: bit.ly"]]);
  });

  it("quarantines a reply the same way", async () => {
    viewer.current = SIGNED_IN;
    spam.verdict = { spam: true, rule: "duplicate", note: "Duplicate body posted within 60 minutes" };
    holder.client = createFakeClient({ tables: { replies: { data: { id: UUID }, error: null } } });

    const data = new FormData();
    data.set("postId", UUID);
    data.set("body", "The same paragraph again.");
    data.set("spoilerLevel", "0");

    expect(await createReply(null, data)).toEqual({ ok: true, data: undefined });
    expect(spam.quarantined).toEqual([["reply", UUID, "user-1", "Duplicate body posted within 60 minutes"]]);
  });

  it("leaves a clean post alone", async () => {
    viewer.current = SIGNED_IN;
    holder.client = createFakeClient({ tables: { posts: { data: { id: UUID }, error: null } } });

    await captureRedirect(() => createPost(null, validPost()));
    expect(spam.quarantined).toHaveLength(0);
  });

  it("runs on an edit too, since that is a second chance to smuggle the same thing in", async () => {
    viewer.current = SIGNED_IN;
    spam.verdict = { spam: true, rule: "blocked_phrase", note: "Blocked phrase: free nitro" };

    await captureRedirect(() =>
      editPost(null, validPost({ postId: UUID, title: "A title long enough to pass", body: "free nitro here" })),
    );

    expect(spam.quarantined).toEqual([["post", UUID, "user-1", "Blocked phrase: free nitro"]]);
  });
});

describe("the block lists", () => {
  it("refuse a non admin", async () => {
    viewer.current = SIGNED_IN;
    expect(await editBlockList(null, form({ list: "domain", action: "add", value: "evil.test" }))).toEqual({
      ok: false,
      error: "That action is not available to you.",
    });
  });

  it("store a pasted URL as a bare host", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    await editBlockList(null, form({ list: "domain", action: "add", value: "https://WWW.Evil.test/spam?x=1" }));

    const insert = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({ domain: "evil.test" });
  });

  it("lowercase a phrase, because that is what the filter matches against", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    await editBlockList(null, form({ list: "phrase", action: "add", value: "  FREE Nitro  " }));

    const insert = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({ phrase: "free nitro" });
  });

  it("say so when an entry is already on the list", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient({ tables: { blocked_domains: { data: null, error: { message: "dupe", code: "23505" } } } });

    expect(await editBlockList(null, form({ list: "domain", action: "add", value: "bit.ly" }))).toEqual({
      ok: false,
      error: "That is already on the list.",
    });
  });

  it("write an audit row for both directions", async () => {
    viewer.current = ADMIN;

    adminHolder.client = createFakeClient();
    await editBlockList(null, form({ list: "phrase", action: "add", value: "free money" }));
    expect(adminHolder.client.calls.find((call) => call.method === "insert" && (call.args[0] as { action?: string }).action === "block_add")).toBeTruthy();

    adminHolder.client = createFakeClient();
    await editBlockList(null, form({ list: "phrase", action: "remove", value: "free money" }));
    const audit = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(audit?.args[0]).toMatchObject({ action: "block_remove", target_type: "phrase" });
  });
});

describe("admin profile edits", () => {
  it("refuse a non admin", async () => {
    viewer.current = SIGNED_IN;
    expect(await adminEditProfile(null, form({ userId: OTHER_USER, username: "newname" }))).toMatchObject({
      ok: false,
    });
  });

  it("rename an account and audit it", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    expect(await adminEditProfile(null, form({ userId: OTHER_USER, username: "NewName" }))).toEqual({
      ok: true,
      data: undefined,
    });

    const update = adminHolder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ username: "newname" });

    const audit = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(audit?.args[0]).toMatchObject({ action: "rename_user", target_type: "user", target_id: OTHER_USER });
  });

  it("clear a bio and audit that separately", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    await adminEditProfile(null, form({ userId: OTHER_USER, clearBio: "true" }));

    const update = adminHolder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ bio: null });

    const audit = adminHolder.client.calls.find((call) => call.method === "insert");
    expect(audit?.args[0]).toMatchObject({ action: "clear_bio" });
  });

  it("refuse a request that changes nothing", async () => {
    viewer.current = ADMIN;
    adminHolder.client = createFakeClient();

    expect(await adminEditProfile(null, form({ userId: OTHER_USER }))).toEqual({
      ok: false,
      error: "Nothing to change.",
    });
    expect(adminHolder.client.calls).toHaveLength(0);
  });

  it("refuse a username that breaks the rules", async () => {
    viewer.current = ADMIN;
    expect(await adminEditProfile(null, form({ userId: OTHER_USER, username: "no" }))).toMatchObject({ ok: false });
  });
});

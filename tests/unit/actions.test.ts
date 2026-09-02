import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };
const viewer: { current: unknown } = { current: null };
const adminHolder: { client: FakeClient } = { client: createFakeClient() };
const adminIds: { value: string } = { value: "" };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

vi.mock("@/lib/viewer", () => ({
  getViewer: async () => viewer.current,
  getViewerProgress: async () => 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => adminHolder.client,
  isAdmin: (id: string | null | undefined) => Boolean(id) && adminIds.value.split(",").includes(id!),
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
const { createGroup, redeemInvite } = await import("@/actions/groups");
const { saveProfile, setProgress, uploadAvatar } = await import("@/actions/profile");
const { completeOnboarding } = await import("@/actions/onboarding");
const { moderate } = await import("@/actions/moderation");

const UUID = "8b2f0f7a-1111-4222-8333-444455556666";
const SIGNED_IN = { userId: "user-1", username: "mara", displayName: null, avatarPath: null, progress: 2, theme: "dark" };

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
  adminIds.value = "";
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

  it("sets progress through the function and refuses bad levels", async () => {
    expect(await setProgress(null, form({ progress: "3" }))).toEqual({
      ok: false,
      error: "Sign in to set your progress.",
    });

    viewer.current = SIGNED_IN;
    expect(await setProgress(null, form({ progress: "3" }))).toEqual({ ok: true, data: undefined });
    expect(await setProgress(null, form({ progress: "9" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({ rpc: { set_progress: { data: null, error: { message: "no" } } } });
    expect(await setProgress(null, form({ progress: "3" }))).toEqual({
      ok: false,
      error: "Your progress could not be saved.",
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
  it("saves a username and progress together", async () => {
    expect(await completeOnboarding(null, form({ username: "mara", progress: "0" }))).toEqual({
      ok: false,
      error: "Sign in first.",
    });

    viewer.current = SIGNED_IN;
    expect(await completeOnboarding(null, form({ username: "mara", progress: "2" }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await completeOnboarding(null, form({ username: "no", progress: "2" }))).toMatchObject({ ok: false });
    expect(await completeOnboarding(null, form({ username: "mara", progress: "12" }))).toMatchObject({ ok: false });

    holder.client = createFakeClient({
      tables: { profiles: { data: null, error: { message: "duplicate", code: "23505" } } },
    });
    expect(await completeOnboarding(null, form({ username: "taken", progress: "0" }))).toEqual({
      ok: false,
      error: "That username is taken.",
    });
  });
});

describe("moderation", () => {
  it("refuses everyone who is not in ADMIN_USER_IDS", async () => {
    viewer.current = SIGNED_IN;
    expect(await moderate(null, form({ targetType: "post", targetId: UUID, action: "hide" }))).toEqual({
      ok: false,
      error: "That action is not available to you.",
    });
  });

  it("hides through the definer function and deletes through the table", async () => {
    viewer.current = SIGNED_IN;
    adminIds.value = "user-1";

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

  it("reports a failure and rejects an unknown action", async () => {
    viewer.current = SIGNED_IN;
    adminIds.value = "user-1";

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

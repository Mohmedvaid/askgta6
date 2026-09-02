import { describe, expect, it } from "vitest";
import {
  acceptReplySchema,
  avatarSchema,
  firstIssue,
  groupInputSchema,
  inviteCodeSchema,
  moderationSchema,
  postEditSchema,
  postInputSchema,
  profileSchema,
  progressSchema,
  replyInputSchema,
  reportSchema,
  themeSchema,
  voteSchema,
} from "@/lib/validation";

const UUID = "8b2f0f7a-1111-4222-8333-444455556666";

const validPost = {
  title: "How big is the Leonida map",
  body: "Trailer two shows a lot of coastline.",
  topic: "map",
  kind: "question",
  spoilerLevel: 0,
  groupId: null,
};

describe("postInputSchema", () => {
  it("accepts a well formed post", () => {
    expect(postInputSchema.parse(validPost).title).toBe("How big is the Leonida map");
  });

  it("rejects a short title", () => {
    const result = postInputSchema.safeParse({ ...validPost, title: "Short" });
    expect(result.success).toBe(false);
    expect(firstIssue(result.error!)).toMatch(/at least 8/);
  });

  it("rejects a title over 140 characters", () => {
    expect(postInputSchema.safeParse({ ...validPost, title: "a".repeat(141) }).success).toBe(false);
  });

  it("rejects an empty body and a body over 10000 characters", () => {
    expect(postInputSchema.safeParse({ ...validPost, body: "   " }).success).toBe(false);
    expect(postInputSchema.safeParse({ ...validPost, body: "a".repeat(10001) }).success).toBe(false);
  });

  it("rejects an unknown topic or kind", () => {
    expect(postInputSchema.safeParse({ ...validPost, topic: "weather" }).success).toBe(false);
    expect(postInputSchema.safeParse({ ...validPost, kind: "poll" }).success).toBe(false);
  });

  it("rejects a spoiler level outside 0 to 7", () => {
    expect(postInputSchema.safeParse({ ...validPost, spoilerLevel: -1 }).success).toBe(false);
    expect(postInputSchema.safeParse({ ...validPost, spoilerLevel: 8 }).success).toBe(false);
    expect(postInputSchema.parse({ ...validPost, spoilerLevel: "3" }).spoilerLevel).toBe(3);
  });

  it("rejects a group id that is not a uuid", () => {
    expect(postInputSchema.safeParse({ ...validPost, groupId: "not-a-uuid" }).success).toBe(false);
  });

  it("trims the title and body", () => {
    const parsed = postInputSchema.parse({ ...validPost, title: "  How big is the map  ", body: "  Body.  " });
    expect(parsed.title).toBe("How big is the map");
    expect(parsed.body).toBe("Body.");
  });
});

describe("postEditSchema", () => {
  it("requires a post id and drops the group", () => {
    const parsed = postEditSchema.parse({ ...validPost, postId: UUID });
    expect(parsed).not.toHaveProperty("groupId");
    expect(postEditSchema.safeParse({ ...validPost, postId: "nope" }).success).toBe(false);
  });
});

describe("reply schemas", () => {
  it("accepts a reply and rejects an empty one", () => {
    expect(replyInputSchema.parse({ postId: UUID, body: "Yes.", spoilerLevel: 2 }).spoilerLevel).toBe(2);
    expect(replyInputSchema.safeParse({ postId: UUID, body: "", spoilerLevel: 0 }).success).toBe(false);
  });
});

describe("voteSchema", () => {
  it.each([
    [1, true],
    [0, true],
    [-1, true],
    [2, false],
    [-2, false],
  ])("accepts %s as %s", (value, expected) => {
    expect(voteSchema.safeParse({ targetType: "post", targetId: UUID, value }).success).toBe(expected);
  });

  it("rejects an unknown target type", () => {
    expect(voteSchema.safeParse({ targetType: "comment", targetId: UUID, value: 1 }).success).toBe(false);
  });
});

describe("acceptReplySchema", () => {
  it("allows a null reply so an accepted answer can be cleared", () => {
    expect(acceptReplySchema.safeParse({ postId: UUID, replyId: null }).success).toBe(true);
    expect(acceptReplySchema.safeParse({ postId: UUID, replyId: "nope" }).success).toBe(false);
  });
});

describe("groupInputSchema", () => {
  it("accepts a group and rejects a bad visibility", () => {
    expect(groupInputSchema.parse({ name: "Night shift", visibility: "private" }).name).toBe("Night shift");
    expect(groupInputSchema.safeParse({ name: "Night shift", visibility: "secret" }).success).toBe(false);
    expect(groupInputSchema.safeParse({ name: "N", visibility: "public" }).success).toBe(false);
    expect(groupInputSchema.safeParse({ name: "Ok name", visibility: "public", description: "d".repeat(501) }).success).toBe(false);
  });
});

describe("inviteCodeSchema", () => {
  it("uppercases and trims", () => {
    expect(inviteCodeSchema.parse({ code: "  night01  " }).code).toBe("NIGHT01");
    expect(inviteCodeSchema.safeParse({ code: "abc" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("lowercases the username and enforces the shape", () => {
    expect(profileSchema.parse({ username: "  ALICE  " }).username).toBe("alice");
    expect(profileSchema.safeParse({ username: "no spaces" }).success).toBe(false);
    expect(profileSchema.safeParse({ username: "ab" }).success).toBe(false);
    expect(profileSchema.safeParse({ username: "alice", displayName: "d".repeat(41) }).success).toBe(false);
  });
});

describe("small schemas", () => {
  it("guards progress, theme, reports, moderation, and avatars", () => {
    expect(progressSchema.safeParse({ progress: 7 }).success).toBe(true);
    expect(progressSchema.safeParse({ progress: 8 }).success).toBe(false);
    expect(themeSchema.safeParse({ theme: "dark" }).success).toBe(true);
    expect(themeSchema.safeParse({ theme: "sepia" }).success).toBe(false);
    expect(reportSchema.safeParse({ targetType: "post", targetId: UUID, reason: "leak" }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: "post", targetId: UUID, reason: "boring" }).success).toBe(false);
    expect(moderationSchema.safeParse({ targetType: "reply", targetId: UUID, action: "hide" }).success).toBe(true);
    expect(moderationSchema.safeParse({ targetType: "reply", targetId: UUID, action: "ban" }).success).toBe(false);
    expect(avatarSchema.safeParse({ size: 1024, type: "image/png" }).success).toBe(true);
    expect(avatarSchema.safeParse({ size: 3_000_000, type: "image/png" }).success).toBe(false);
    expect(avatarSchema.safeParse({ size: 1024, type: "image/tiff" }).success).toBe(false);
  });
});

describe("firstIssue", () => {
  it("returns the first message", () => {
    const result = postInputSchema.safeParse({});
    expect(firstIssue(result.error!).length).toBeGreaterThan(0);
  });
});

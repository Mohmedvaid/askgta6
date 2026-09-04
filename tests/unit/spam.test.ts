import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient, type FakeClientOptions } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => holder.client }));

const { checkSpam, normalizeBody, quarantine } = await import("@/lib/spam");
const { createHash } = await import("node:crypto");

const md5 = (value: string) => createHash("md5").update(normalizeBody(value)).digest("hex");

const LISTS = {
  blocked_domains: { data: [{ domain: "bit.ly" }, { domain: "pastebin.com" }], error: null },
  blocked_phrases: { data: [{ phrase: "free nitro" }, { phrase: "dm me" }], error: null },
  recent_body_hashes: { data: [], error: null },
};

function client(overrides: FakeClientOptions["tables"] = {}) {
  holder.client = createFakeClient({ tables: { ...LISTS, ...overrides } });
  return holder.client;
}

beforeEach(() => {
  client();
});

describe("normalizeBody", () => {
  it("lowercases and flattens whitespace, matching what the SQL view stores", () => {
    expect(normalizeBody("  Free   NITRO\n\nhere ")).toBe("free nitro here");
  });
});

describe("blocked domains", () => {
  it("catches a link to a blocked host and names it", async () => {
    expect(await checkSpam({ body: "grab it at https://bit.ly/abc" })).toEqual({
      spam: true,
      rule: "blocked_domain",
      note: "Blocked domain: bit.ly",
    });
  });

  it("catches a subdomain of a blocked host", async () => {
    // A shortener on a custom subdomain is the same shortener.
    const verdict = await checkSpam({ body: "see https://links.bit.ly/abc" });
    expect(verdict).toMatchObject({ spam: true, rule: "blocked_domain" });
  });

  it("ignores a host that merely ends in similar letters", async () => {
    expect(await checkSpam({ body: "read https://notbit.ly/abc" })).toEqual({ spam: false });
  });

  it("leaves an ordinary link alone", async () => {
    expect(await checkSpam({ body: "the map is at https://example.com/map" })).toEqual({ spam: false });
  });

  it("does not ask the domain list anything when the body has no links", async () => {
    const fake = client();
    await checkSpam({ body: "no links in this one at all" });
    expect(fake.calls.some((call) => call.args[0] === "blocked_domains")).toBe(false);
  });
});

describe("blocked phrases", () => {
  it("catches a phrase whatever the casing and spacing", async () => {
    expect(await checkSpam({ body: "FREE    Nitro for everyone" })).toEqual({
      spam: true,
      rule: "blocked_phrase",
      note: "Blocked phrase: free nitro",
    });
  });

  it("catches a phrase inside a sentence", async () => {
    const verdict = await checkSpam({ body: "if you want in, dm me and I will sort it" });
    expect(verdict).toMatchObject({ spam: true, rule: "blocked_phrase", note: "Blocked phrase: dm me" });
  });

  it("leaves a body that says none of them alone", async () => {
    expect(await checkSpam({ body: "the causeway takes about forty seconds at speed" })).toEqual({ spam: false });
  });
});

describe("duplicates", () => {
  it("catches the same body from another account inside the hour", async () => {
    const body = "Exactly the same paragraph, posted twice.";
    client({ recent_body_hashes: { data: [{ id: "other-row", body_hash: md5(body) }], error: null } });

    expect(await checkSpam({ body })).toEqual({
      spam: true,
      rule: "duplicate",
      note: "Duplicate body posted within 60 minutes",
    });
  });

  it("matches through casing and spacing, since that is the cheapest way around it", async () => {
    const body = "Exactly the same paragraph, posted twice.";
    client({ recent_body_hashes: { data: [{ id: "other-row", body_hash: md5(body) }], error: null } });

    expect(await checkSpam({ body: "exactly   the SAME paragraph, posted twice." })).toMatchObject({
      spam: true,
      rule: "duplicate",
    });
  });

  it("does not flag a post as a duplicate of itself when it is edited", async () => {
    const body = "The body of a post being edited.";
    client({ recent_body_hashes: { data: [{ id: "post-1", body_hash: md5(body) }], error: null } });

    expect(await checkSpam({ body, excludeId: "post-1" })).toEqual({ spam: false });
  });
});

describe("the order of the rules", () => {
  it("reports the domain first when a body trips more than one", async () => {
    client({ recent_body_hashes: { data: [], error: null } });
    const verdict = await checkSpam({ body: "free nitro at https://bit.ly/abc" });

    // The most specific and least arguable rule is the one worth naming.
    expect(verdict).toMatchObject({ rule: "blocked_domain" });
  });

  it("passes an empty body without asking anything", async () => {
    const fake = client();
    expect(await checkSpam({ body: "   " })).toEqual({ spam: false });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("quarantine", () => {
  it("hides the item and files a report naming the rule", async () => {
    const fake = client();
    await quarantine("post", "post-1", "author-1", "Blocked domain: bit.ly");

    const hide = fake.calls.find((call) => call.method === "rpc");
    expect(hide?.args[0]).toBe("set_hidden");
    expect(hide?.args[1]).toEqual({ p_target_type: "post", p_target_id: "post-1", p_hidden: true });

    const insert = fake.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      target_type: "post",
      target_id: "post-1",
      reason: "spam",
      note: "Filter: Blocked domain: bit.ly",
    });
  });

  it("does not throw when the hide fails, because the report still matters", async () => {
    client({ reports: { data: null, error: null } });
    holder.client = createFakeClient({
      tables: LISTS,
      rpc: { set_hidden: { data: null, error: { message: "no" } } },
    });

    await expect(quarantine("reply", "reply-1", "author-1", "Duplicate")).resolves.toBeUndefined();
  });
});

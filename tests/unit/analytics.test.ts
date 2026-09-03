import { describe, expect, it, vi } from "vitest";

const vercelTrack = vi.fn();
vi.mock("@vercel/analytics", () => ({ track: vercelTrack }));

const { ANALYTICS_EVENTS, track } = await import("@/lib/analytics");

describe("analytics", () => {
  it("ships exactly four events and no more", () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      "signup_completed",
      "progress_set",
      "post_created",
      "reveal_clicked",
    ]);
  });

  it("passes the event and its properties straight through", () => {
    track("post_created", { kind: "question", topic: "map", spoiler_level: 0, in_group: false });
    expect(vercelTrack).toHaveBeenCalledWith("post_created", {
      kind: "question",
      topic: "map",
      spoiler_level: 0,
      in_group: false,
    });
  });
});

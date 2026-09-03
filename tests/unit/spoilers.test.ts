import { describe, expect, it } from "vitest";
import {
  SPOILER_LEVELS,
  SPOILER_LEVEL_COUNT,
  applySpoilerGate,
  applySpoilerGateAll,
  canReveal,
  clampProgress,
  spoilerLevelInfo,
} from "@/lib/spoilers";

const post = (spoilerLevel: number) => ({
  id: "post-1",
  topic: "story",
  kind: "question",
  spoiler_level: spoilerLevel,
  vote_count: 3,
  reply_count: 2,
  created_at: "2026-01-01T00:00:00.000Z",
  title: "A title a reader may always see",
  body: "A body that must not leak.",
});

describe("clampProgress", () => {
  it.each([
    [-5, 0],
    [-1, 0],
    [0, 0],
    [3, 3],
    [7, 7],
    [8, 7],
    [99, 7],
    [3.9, 3],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampProgress(input)).toBe(expected);
  });

  it.each([[null], [undefined], ["not a number"], [Number.NaN], [Infinity]])(
    "falls back to 0 for %s",
    (input) => {
      expect(clampProgress(input)).toBe(0);
    },
  );

  it("accepts numeric strings", () => {
    expect(clampProgress("5")).toBe(5);
  });
});

describe("SPOILER_LEVELS", () => {
  it("ships exactly eight levels numbered 0 through 7", () => {
    expect(SPOILER_LEVELS).toHaveLength(SPOILER_LEVEL_COUNT);
    expect(SPOILER_LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("gives every level a label and a description", () => {
    for (const level of SPOILER_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.description.length).toBeGreaterThan(0);
    }
  });

  it("looks a level up and clamps out of range requests", () => {
    expect(spoilerLevelInfo(0).label).toBe("Haven't played");
    expect(spoilerLevelInfo(7).label).toBe("Finished");
    expect(spoilerLevelInfo(42).level).toBe(7);
  });
});

describe("applySpoilerGate", () => {
  it("returns the whole item when the viewer has reached its level", () => {
    const gated = applySpoilerGate(post(3), 3);
    expect(gated.hidden).toBe(false);
    expect(gated).toMatchObject({ title: "A title a reader may always see", body: "A body that must not leak." });
  });

  it("returns the whole item when the viewer is ahead of it", () => {
    const gated = applySpoilerGate(post(1), 7);
    expect(gated.hidden).toBe(false);
  });

  it("keeps the title and strips only the body when the viewer is behind it", () => {
    const gated = applySpoilerGate(post(4), 1);
    expect(gated.hidden).toBe(true);
    expect(Object.keys(gated)).toContain("title");
    expect(Object.keys(gated)).not.toContain("body");
    expect(JSON.stringify(gated)).toContain("A title a reader may always see");
    expect(JSON.stringify(gated)).not.toContain("must not leak");
  });

  it("leaks no body length hint for a hidden item", () => {
    const short = applySpoilerGate({ spoiler_level: 5, title: "Hi there", body: "x" }, 0);
    const long = applySpoilerGate({ spoiler_level: 5, title: "Hi there", body: "x".repeat(9000) }, 0);
    expect(JSON.stringify(short)).toBe(JSON.stringify(long));
  });

  it("keeps everything a placeholder card needs, title included", () => {
    const gated = applySpoilerGate(post(6), 0);
    expect(gated).toMatchObject({
      id: "post-1",
      title: "A title a reader may always see",
      topic: "story",
      kind: "question",
      spoiler_level: 6,
      vote_count: 3,
      reply_count: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("treats an out of range viewer progress as clamped", () => {
    expect(applySpoilerGate(post(7), 999).hidden).toBe(false);
    expect(applySpoilerGate(post(1), -3).hidden).toBe(true);
  });

  it("gates every level boundary exactly once", () => {
    for (let viewer = 0; viewer < SPOILER_LEVEL_COUNT; viewer += 1) {
      for (let level = 0; level < SPOILER_LEVEL_COUNT; level += 1) {
        expect(applySpoilerGate(post(level), viewer).hidden).toBe(level > viewer);
      }
    }
  });

  it("does not mutate the source item", () => {
    const source = post(5);
    applySpoilerGate(source, 0);
    expect(source.body).toBe("A body that must not leak.");
  });

  it("gates a reply shape with no title at all", () => {
    const gated = applySpoilerGate({ spoiler_level: 2, body: "Secret reply." }, 0);
    expect(gated.hidden).toBe(true);
    expect(Object.keys(gated)).not.toContain("body");
  });
});

describe("applySpoilerGateAll", () => {
  it("gates each item on its own level", () => {
    const gated = applySpoilerGateAll([post(0), post(2), post(5)], 2);
    expect(gated.map((item) => item.hidden)).toEqual([false, false, true]);
  });

  it("returns an empty list unchanged", () => {
    expect(applySpoilerGateAll([], 3)).toEqual([]);
  });
});

describe("canReveal", () => {
  it("accepts every shipped level and rejects nonsense", () => {
    expect(canReveal({ spoiler_level: 0 })).toBe(true);
    expect(canReveal({ spoiler_level: 7 })).toBe(true);
    expect(canReveal({ spoiler_level: 8 })).toBe(false);
    expect(canReveal({ spoiler_level: -1 })).toBe(false);
  });
});

describe("applySpoilerGate on nested rows", () => {
  it("strips a body carried by an embedded row, however deep, and keeps its title", () => {
    const gated = applySpoilerGate(
      {
        spoiler_level: 7,
        body: "Sealed.",
        author: { username: "mara", display_name: "Mara" },
        post: [{ id: "p1", title: "A late game headline", body: "Sealed too." }],
        group: { slug: "vice", name: "Vice City locals" },
      },
      0,
    );

    expect(gated.hidden).toBe(true);
    const payload = JSON.stringify(gated);
    expect(payload).toContain("late game headline");
    expect(payload).not.toContain("Sealed");
  });

  it("leaves the metadata a placeholder card needs, including nested author and group", () => {
    const gated = applySpoilerGate(
      {
        spoiler_level: 4,
        body: "Sealed.",
        author: { username: "mara", display_name: "Mara" },
        group: { slug: "vice", name: "Vice City locals" },
      },
      0,
    ) as Record<string, unknown>;

    expect(gated.author).toEqual({ username: "mara", display_name: "Mara" });
    expect(gated.group).toEqual({ slug: "vice", name: "Vice City locals" });
  });

  it("touches nothing nested when the item is visible", () => {
    const visible = applySpoilerGate(
      { spoiler_level: 0, body: "Open.", post: [{ title: "A safe headline" }] },
      0,
    ) as Record<string, unknown>;

    expect(visible.hidden).toBe(false);
    expect(JSON.stringify(visible)).toContain("A safe headline");
    expect(JSON.stringify(visible)).toContain("Open.");
  });

  it("leaves values that are not plain objects alone", () => {
    const created = new Date("2026-06-01T12:00:00.000Z");
    const gated = applySpoilerGate({ spoiler_level: 5, body: "Sealed.", created_at: created }, 0) as Record<
      string,
      unknown
    >;

    expect(gated.created_at).toBe(created);
  });
});

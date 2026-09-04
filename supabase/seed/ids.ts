import { createHash } from "node:crypto";

/**
 * Deterministic identifiers, so a second run updates what the first run wrote
 * instead of doubling it.
 *
 * uuid v5 is a sha1 of a namespace plus a name, so the same seed row always
 * produces the same uuid on any machine, with no state kept between runs and
 * nothing to look up first. The namespace is fixed here forever: changing it
 * would orphan everything already imported rather than update it.
 */
export const SEED_NAMESPACE = "6f9619ff-8b86-d011-b42d-00c04fc964ff";

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/-/g, ""), "hex");
}

export function uuidv5(name: string, namespace: string = SEED_NAMESPACE): string {
  const hash = createHash("sha1").update(Buffer.concat([hexToBytes(namespace), Buffer.from(name, "utf8")])).digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Every id the importer writes, derived from something stable in the file.
 *
 * Accounts key off the username rather than the row position, so reordering
 * seed.json does not rewrite the forum.
 */
export const ids = {
  account: (username: string) => uuidv5(`account:${username}`),
  voter: (index: number) => uuidv5(`voter:${index}`),
  post: (seedId: string) => uuidv5(`post:${seedId}`),
  reply: (seedId: string) => uuidv5(`reply:${seedId}`),
  group: (slug: string) => uuidv5(`group:${slug}`),
};

/** Seed account emails are derived too, so they never need looking up either. */
export const emails = {
  account: (username: string) => `${username}@seed.askgta6.local`,
  voter: (index: number) => `voter-${String(index).padStart(4, "0")}@seed.askgta6.local`,
};

export const SEED_EMAIL_DOMAIN = "seed.askgta6.local";

/**
 * A small deterministic generator, so which voters land on which item is fixed
 * across runs and machines. Nothing here needs to be unpredictable, only stable.
 */
export function seededRandom(seed: string): () => number {
  let value = Number.parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/** Deterministic Fisher Yates, used to pick which voters vote on an item. */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const next = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

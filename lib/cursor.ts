/** Keyset pagination cursor over (created_at, id). Opaque to the client, cheap to parse. */
export type FeedCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): FeedCursor | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf("|");
  if (separator < 1) return null;

  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!id || Number.isNaN(Date.parse(createdAt))) return null;

  return { createdAt, id };
}

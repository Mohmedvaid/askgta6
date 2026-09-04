import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import { linkedHosts } from "./links";

/**
 * The spam filter, run server side on every create and edit of a post or a reply.
 *
 * It does not refuse. A match saves the item hidden and files a report against it,
 * so the thing lands in the admin queue with a note saying which rule fired. Two
 * reasons for that shape. A refusal tells a spammer exactly which word to change,
 * and a filter that only refuses leaves no record of what it caught, so nobody can
 * tell an over eager rule from an effective one.
 *
 * Reads go through the service role key because the lists are admin only, and the
 * duplicate check has to see bodies written by other accounts.
 */

export type SpamRule = "blocked_domain" | "blocked_phrase" | "duplicate";

export type SpamVerdict = { spam: false } | { spam: true; rule: SpamRule; note: string };

/** Lowercased, punctuation kept, whitespace flattened. Matches the SQL view. */
export function normalizeBody(body: string): string {
  return body.toLowerCase().replace(/\s+/g, " ").trim();
}

async function blockedDomainHit(body: string): Promise<string | null> {
  const hosts = linkedHosts(body);
  if (hosts.length === 0) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("blocked_domains").select("domain");

  for (const row of (data ?? []) as { domain: string }[]) {
    const blocked = row.domain.toLowerCase();
    // A subdomain of a blocked host is the same host for this purpose, which is
    // how a shortener with a custom domain gets past a plain equality check.
    if (hosts.some((host) => host === blocked || host.endsWith(`.${blocked}`))) return blocked;
  }

  return null;
}

async function blockedPhraseHit(normalized: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("blocked_phrases").select("phrase");

  for (const row of (data ?? []) as { phrase: string }[]) {
    if (normalized.includes(row.phrase.toLowerCase())) return row.phrase;
  }

  return null;
}

/**
 * The same body from any account inside the hour.
 *
 * Across accounts on purpose: one person posting the same thing twice is careless,
 * the same paragraph from three fresh accounts is a campaign, and the second is
 * what this is for. The window is read from a view so the normalization lives in
 * one place per layer and both use md5 of the same flattened text.
 */
async function duplicateHit(body: string, excludeId: string | null): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("recent_body_hashes").select("id, body_hash");

  const target = await md5(normalizeBody(body));
  return ((data ?? []) as { id: string; body_hash: string }[]).some(
    (row) => row.body_hash === target && row.id !== excludeId,
  );
}

async function md5(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(value).digest("hex");
}

export type SpamCheckInput = {
  body: string;
  /** The row being edited, so a post does not read as a duplicate of itself. */
  excludeId?: string | null;
};

export async function checkSpam({ body, excludeId = null }: SpamCheckInput): Promise<SpamVerdict> {
  const normalized = normalizeBody(body);
  if (!normalized) return { spam: false };

  const domain = await blockedDomainHit(body);
  if (domain) {
    return { spam: true, rule: "blocked_domain", note: `Blocked domain: ${domain}` };
  }

  const phrase = await blockedPhraseHit(normalized);
  if (phrase) {
    return { spam: true, rule: "blocked_phrase", note: `Blocked phrase: ${phrase}` };
  }

  if (await duplicateHit(body, excludeId)) {
    return { spam: true, rule: "duplicate", note: "Duplicate body posted within 60 minutes" };
  }

  return { spam: false };
}

/**
 * Hides the item and files the report that puts it in the queue.
 *
 * The report is filed by the author against their own content, which reads odd
 * until you look at what the queue needs: a row pointing at the item, a reason, and
 * a note. reports has a unique constraint per reporter per item, so the filter
 * cannot stack duplicates on the same thing.
 */
export async function quarantine(
  targetType: "post" | "reply",
  targetId: string,
  authorId: string,
  note: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { error: hideError } = await admin.rpc("set_hidden", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_hidden: true,
  });
  if (hideError) console.error("[spam] could not hide", { targetType, message: hideError.message });

  const { error: reportError } = await admin.from("reports").insert({
    reporter_id: authorId,
    target_type: targetType,
    target_id: targetId,
    reason: "spam",
    note: `Filter: ${note}`,
  });
  if (reportError) console.error("[spam] could not file the report", { targetType, message: reportError.message });
}

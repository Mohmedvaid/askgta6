"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, voteSchema, type ActionResult } from "@/lib/validation";
import { safePostPath } from "@/lib/post-url";

export async function castVote(input: unknown): Promise<ActionResult<number>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to vote." };

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cast_vote", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_value: parsed.data.value,
  });

  if (error) return { ok: false, error: "That vote did not go through." };

  revalidatePath("/feed");
  // A vote cast on a thread changes the count on that page too. The path travels
  // with the request because the action holds the row's uuid, not its short id.
  const path = safePostPath(parsed.data.path);
  if (path) revalidatePath(path);

  return { ok: true, data: Number(data ?? 0) };
}

export async function getMyVote(targetType: "post" | "reply", targetId: string): Promise<number> {
  const viewer = await getViewer();
  if (!viewer) return 0;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("votes")
    .select("value")
    .eq("user_id", viewer.userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  return data?.value ?? 0;
}

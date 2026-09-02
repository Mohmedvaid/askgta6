import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { PrivateGroupGate } from "@/components/group/PrivateGroupGate";

export const metadata: Metadata = { title: "Join a group" };

export default async function JoinGroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/sign-in?next=/g/join/${encodeURIComponent(code)}`);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("join_group_by_invite", { p_code: code.toUpperCase() });

  if (data) redirect(`/g/${data}`);
  return <PrivateGroupGate />;
}

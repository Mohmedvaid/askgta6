import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/form/ResetPasswordForm";
import { getViewer } from "@/lib/viewer";
import { hasRecoveryMarker } from "@/lib/recovery";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Two gates, both required.
 *
 * A session, because the password is changed through it. And the recovery marker,
 * which only the callback route sets and only for a link that asked for this page.
 * Without the second, this would be a change password form that any signed in
 * reader could reach by typing the URL, which is not what a recovery link is for.
 *
 * Either gate failing sends the person to ask for a fresh link rather than
 * explaining which one it was.
 */
export default async function ResetPasswordPage() {
  if (!(await hasRecoveryMarker())) redirect("/auth/forgot");

  if (!(await getViewer())) redirect("/auth/forgot");

  return <ResetPasswordForm />;
}

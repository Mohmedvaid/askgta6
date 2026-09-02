import type { Metadata } from "next";
import { AuthForm } from "@/components/form/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <AuthForm
      mode="sign-in"
      next={next}
      discordEnabled={process.env.NEXT_PUBLIC_AUTH_DISCORD_ENABLED === "true"}
      googleEnabled={process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true"}
    />
  );
}

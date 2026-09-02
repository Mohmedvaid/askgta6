import type { Metadata } from "next";
import { AuthForm } from "@/components/form/AuthForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthForm
      mode="sign-up"
      discordEnabled={process.env.NEXT_PUBLIC_AUTH_DISCORD_ENABLED === "true"}
      googleEnabled={process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true"}
    />
  );
}

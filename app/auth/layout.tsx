import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="text-text-primary">
        <Wordmark className="h-7 w-auto" />
      </Link>
      <div className="mt-10">{children}</div>
    </div>
  );
}

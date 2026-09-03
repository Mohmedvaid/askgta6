import Image from "next/image";
import { Mark } from "./brand/Mark";

type AvatarProps = {
  username: string;
  url?: string | null;
  size?: number;
};

export function Avatar({ username, url, size = 32 }: AvatarProps) {
  if (!url) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ width: size, height: size }}
      >
        <Mark size={size} />
      </span>
    );
  }

  return (
    // Through next/image so the Supabase original is resized and re-encoded once
    // rather than shipped whole to every reader. The host is allowed in
    // next.config.ts; without that entry this throws rather than falling back.
    <Image
      src={url}
      alt={`${username} avatar`}
      width={size}
      height={size}
      sizes={`${size}px`}
      className="shrink-0 rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  );
}

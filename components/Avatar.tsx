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
    // Avatars come from one Supabase bucket at a known size, so the plain tag is the right tool.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${username} avatar`}
      width={size}
      height={size}
      className="shrink-0 rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  );
}

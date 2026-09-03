import { ImageResponse } from "next/og";
import { getPost } from "@/lib/queries/posts";
import { TOPIC_LABELS } from "@/lib/topics";
import { OG_PALETTE } from "@/lib/theme/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AskGTA6";


/**
 * Titles are visible at every level, so the preview carries the real one whatever
 * the post is tagged. Bodies never reach this route.
 */
export default async function OpengraphImage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = await getPost(postId, 0);

  const heading = post?.title ?? "A thread on AskGTA6";
  const topic = post ? TOPIC_LABELS[post.topic] : "Community";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG_PALETTE.ink,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: OG_PALETTE.accent }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: OG_PALETTE.paper }}>
            Ask<span style={{ color: OG_PALETTE.accent }}>GTA6</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 24, letterSpacing: 4, textTransform: "uppercase", color: OG_PALETTE.accent }}>{topic}</div>
          <div style={{ fontSize: 62, lineHeight: 1.1, fontWeight: 700, color: OG_PALETTE.paper }}>{heading}</div>
        </div>

        <div style={{ fontSize: 24, color: OG_PALETTE.muted }}>Spoiler safe GTA VI community</div>
      </div>
    ),
    size,
  );
}

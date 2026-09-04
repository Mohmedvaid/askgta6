import { ImageResponse } from "next/og";
import { getPostByShortId } from "@/lib/queries/posts";
import { TOPIC_LABELS } from "@/lib/topics";
import { OG_PALETTE } from "@/lib/theme/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AskGTA6";

/**
 * Titles are visible at every level, so the preview carries the real one whatever
 * the post is tagged. Bodies never reach this route.
 *
 * The mark is redrawn here rather than imported, because Satori renders a subset of
 * CSS and reads no custom properties. It is the same two knocked out lines the
 * square mark carries, at three times the size.
 */
export default async function OpengraphImage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await params;
  const post = await getPostByShortId(shortId, 0);

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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 9,
              width: 60,
              height: 60,
              borderRadius: 17,
              background: OG_PALETTE.accent,
              padding: "0 13px",
            }}
          >
            <div style={{ width: 34, height: 7.5, borderRadius: 4, background: OG_PALETTE.accentInk }} />
            <div style={{ display: "flex", gap: 5 }}>
              <div style={{ width: 15, height: 7.5, borderRadius: 4, background: OG_PALETTE.accentInk }} />
              <div style={{ width: 7.5, height: 7.5, borderRadius: 4, background: OG_PALETTE.accentInk, opacity: 0.4 }} />
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: OG_PALETTE.paper }}>
            Ask<span style={{ color: OG_PALETTE.accent }}>GTA6</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 24, letterSpacing: 5, textTransform: "uppercase", color: OG_PALETTE.accent }}>
            {topic}
          </div>
          <div style={{ fontSize: 62, lineHeight: 1.1, fontWeight: 700, color: OG_PALETTE.paper }}>{heading}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            borderTop: `2px solid ${OG_PALETTE.line}`,
            paddingTop: 26,
            fontSize: 24,
            color: OG_PALETTE.muted,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 5, background: OG_PALETTE.accent }} />
          Spoiler safe GTA VI community
        </div>
      </div>
    ),
    size,
  );
}

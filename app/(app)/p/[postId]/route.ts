import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getPostUrlParts } from "@/lib/queries/posts";
import { postPath } from "@/lib/post-url";

/**
 * The old post URL, kept forever as a redirect.
 *
 * Every link that was ever shared, and every place inside the app that only
 * holds a post's uuid, still resolves through here. A route handler rather than
 * a page, because this is the one spot in the app that can emit a literal 301:
 * a server component can only throw the 307 or 308 that next/navigation offers.
 */
export async function GET(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = await getPostUrlParts(postId);

  if (!post) notFound();
  // Resolved against the request rather than the configured site URL, so this
  // can only ever send a reader to another page on the host they asked for.
  return NextResponse.redirect(new URL(postPath(post), request.url), 301);
}

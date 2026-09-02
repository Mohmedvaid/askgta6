import { renderMarkdown } from "@/lib/markdown";

/** The body is rendered from our own markdown output, which never contains user HTML. */
export function PostBody({ body }: { body: string }) {
  return <div className="prose-body mt-6 text-base" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />;
}

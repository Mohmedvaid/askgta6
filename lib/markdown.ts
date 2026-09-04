import { USER_LINK_REL } from "./links";

/**
 * A deliberately small markdown renderer for post and reply bodies.
 * Everything is HTML escaped first and only tags this file emits ever reach the page,
 * so there is no sanitizer to misconfigure and no path for raw user HTML.
 * Supported: paragraphs, fenced and inline code, bold, italic, links, and lists.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return /^(https?:\/\/|mailto:)/i.test(trimmed);
}

function renderInline(escaped: string, token: string): string {
  const codeSpans: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `${token}${codeSpans.length - 1}${token}`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) =>
    isSafeHref(href)
      ? `<a href="${href.trim()}" rel="${USER_LINK_REL}" target="_blank">${label}</a>`
      : match,
  );

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return text.replace(
    new RegExp(`${token}(\\d+)${token}`, "g"),
    (_match, index: string) => `<code>${codeSpans[Number(index)]}</code>`,
  );
}

const BULLET = /^\s*[-*]\s+/;
const NUMBER = /^\s*\d+\.\s+/;

export function renderMarkdown(source: string): string {
  // Code spans are lifted out before inline formatting runs. The token is per call
  // so a body that happens to contain the literal token cannot collide with it.
  const token = `cs${Math.random().toString(36).slice(2, 8)}`;
  const lines = escapeHtml(source.replace(/\r\n/g, "\n")).split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trimStart().startsWith("```")) {
        code.push(lines[index]!);
        index += 1;
      }
      index += 1;
      html.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const pattern = ordered ? NUMBER : BULLET;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index]!)) {
        items.push(`<li>${renderInline(lines[index]!.replace(pattern, ""), token)}</li>`);
        index += 1;
      }
      html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() !== "" &&
      !lines[index]!.trimStart().startsWith("```") &&
      !BULLET.test(lines[index]!) &&
      !NUMBER.test(lines[index]!)
    ) {
      paragraph.push(lines[index]!);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), token)}</p>`);
  }

  return html.join("");
}

/** Plain text preview for feed cards. */
export function excerpt(body: string, length = 160): string {
  const flat = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flat.length <= length) return flat;
  return `${flat.slice(0, length).trimEnd()}...`;
}

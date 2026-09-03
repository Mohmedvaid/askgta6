import type { JsonLd as JsonLdData } from "@/lib/structured-data";

/**
 * Renders a JSON-LD block, or nothing when the page is not indexable.
 *
 * The `<` escape is what stops a title containing `</script>` from closing the
 * block early. Everything else is already safe, because JSON.stringify drops the
 * undefined a sealed body leaves behind.
 */
export function JsonLd({ data }: { data: JsonLdData | null }) {
  if (!data) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

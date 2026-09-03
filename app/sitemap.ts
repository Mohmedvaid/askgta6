import type { MetadataRoute } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { indexingEnabled } from "@/lib/indexing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MAX_POSTS = 2000;

/** Empty while indexing is off. When on, only the pages that are actually indexable. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingEnabled()) return [];

  const supabase = await createSupabaseServerClient();

  const [posts, groups] = await Promise.all([
    supabase
      .from("posts")
      .select("id, updated_at")
      .eq("spoiler_level", 0)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(MAX_POSTS),
    supabase.from("groups").select("slug, created_at").eq("visibility", "public").limit(500),
  ]);

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/feed`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/g`, changeFrequency: "weekly", priority: 0.5 },
    ...(groups.data ?? []).map((group) => ({
      url: `${siteUrl}/g/${group.slug}`,
      lastModified: new Date(group.created_at),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...(posts.data ?? []).map((post) => ({
      url: `${siteUrl}/p/${post.id}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

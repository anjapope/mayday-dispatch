import type { MetadataRoute } from "next";
import { browsePublications } from "@/publications/public-query";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.MAYDAY_PUBLIC_BASE_URL;
  if (!baseUrl) return [];
  const publications = await browsePublications();
  return [
    { url: new URL("/", baseUrl).toString() },
    { url: new URL("/publications", baseUrl).toString() },
    ...publications.map((publication) => ({
      url: new URL(`/publications/${publication.slug}`, baseUrl).toString(),
      lastModified: publication.revision.updatedAt,
    })),
  ];
}

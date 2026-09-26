import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.MAYDAY_PUBLIC_BASE_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/editorial", "/api"] }],
    ...(baseUrl ? { sitemap: new URL("/sitemap.xml", baseUrl).toString() } : {}),
  };
}

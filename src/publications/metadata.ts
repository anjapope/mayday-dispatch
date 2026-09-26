export function canonicalUrl(path: string): string | undefined {
  const baseUrl = process.env.MAYDAY_PUBLIC_BASE_URL;
  return baseUrl ? new URL(path, baseUrl).toString() : undefined;
}

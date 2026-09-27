import type { Metadata } from "next";
import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
import { canonicalUrl } from "@/publications/metadata";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/") },
};
import { DispatchMapExperience } from "./dispatch-map-experience";

export default async function HomePage() {
  const publications = await browsePublications();

  return (
    <main className="shell public-home">
      {publications.length > 0
        ? <DispatchMapExperience publications={publications} />
        : (
          <section className="empty-homepage" aria-labelledby="empty-homepage-title">
            <p className="eyebrow">Mayday Dispatch</p>
            <h1 id="empty-homepage-title">Research, analysis, and public reporting.</h1>
            <p>No publications have been publicly released yet. Material remains private until it completes editorial review and a publisher explicitly authorizes its release.</p>
            <nav aria-label="Publication sections">
              <Link href="/global-monitor">Global Monitor</Link>
              <Link href="/analysis">Analysis</Link>
              <Link href="/forecast">Forecast</Link>
            </nav>
          </section>
        )}
    </main>
  );
}

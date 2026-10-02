import type { Metadata } from "next";
import { browsePublications } from "@/publications/public-query";
import { canonicalUrl } from "@/publications/metadata";
import { fixtureNewsObservationProvider } from "@/news-observations/fixture-provider";
import { readSynchronizedObservationFeed } from "@/news-observations/synchronized-feed";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/") },
};
import { DispatchMapExperience } from "./dispatch-map-experience";

export default async function HomePage() {
  const publications = await browsePublications();
  const configuredSynchronizedFeed = process.env.MAYDAY_INTELLIGENCE_FEED_MODE === "synchronized";
  const synchronized = configuredSynchronizedFeed ? readSynchronizedObservationFeed() : undefined;
  const news = synchronized?.page ?? await fixtureNewsObservationProvider.list({ limit: 8 });
  const providerStatus = synchronized?.status ?? fixtureNewsObservationProvider.status;

  return (
    <main className="shell public-home">
      <DispatchMapExperience publications={publications} newsObservations={news.observations} providerStatus={providerStatus} />
    </main>
  );
}

import type { Metadata } from "next";
import { browsePublications } from "@/publications/public-query";
import { canonicalUrl } from "@/publications/metadata";
import { fixtureNewsObservationProvider } from "@/news-observations/fixture-provider";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/") },
};
import { DispatchMapExperience } from "./dispatch-map-experience";

export default async function HomePage() {
  const publications = await browsePublications();
  const news = await fixtureNewsObservationProvider.list({ limit: 8 });

  return (
    <main className="shell public-home">
      <DispatchMapExperience publications={publications} newsObservations={news.observations} providerStatus={fixtureNewsObservationProvider.status} />
    </main>
  );
}

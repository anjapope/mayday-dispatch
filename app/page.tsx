import type { Metadata } from "next";
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
      {publications.length > 0 && <DispatchMapExperience publications={publications} />}
    </main>
  );
}

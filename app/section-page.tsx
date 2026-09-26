import Link from "next/link";
import { browsePublicSection, type PublicSection } from "@/publications/public-query";
import { PublicationCard } from "./publications/publication-card";

const content: Record<PublicSection, { title: string; introduction: string }> = {
  "global-monitor": { title: "Global Monitor", introduction: "Current reports, briefs, and concise dispatches from public monitoring work." },
  analysis: { title: "Analysis", introduction: "Longer research and interpretive reporting grounded in public evidence." },
  forecast: { title: "Forecast", introduction: "Forward-looking work that states its evidence, assumptions, and uncertainty." },
};

export async function PublicSectionPage({ section }: { section: PublicSection }) {
  const publications = await browsePublicSection(section);
  const copy = content[section];
  return <main className={`shell section-page section-page--${section}`}><header className="masthead"><h1>{copy.title}</h1><p className="lede">{copy.introduction}</p></header>
    {publications.length ? <div className="publication-grid">{publications.map((publication) => <PublicationCard key={publication.id} publication={publication} />)}</div> : <section className="empty-public-section"><p>No public {copy.title.toLowerCase()} items are available yet.</p><Link href="/publications">Browse all published work</Link></section>}
  </main>;
}

import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
import { PublicationCard } from "./publications/publication-card";

export default async function HomePage() {
  const publications = await browsePublications();
  const lead = publications[0];
  const research = publications.filter((item) => item.type === "academic-research-article").slice(0, 3);
  const intelligence = publications.filter((item) => item.type.includes("overwatch")).slice(0, 3);
  const dispatches = publications.filter((item) => item.type === "short-dispatch").slice(0, 3);

  return (
    <main className="shell public-home">
      <header className="masthead"><p className="eyebrow">Mayday Dispatch</p><h1>Research, evidence, and intelligence for consequential moments.</h1><p className="lede">Public work from the Mayday system, edited for clarity, attribution, and accountable updates.</p></header>
      {lead && <section className="lead-publication" aria-labelledby="lead-heading"><p className="eyebrow">Latest publication</p><h2 id="lead-heading"><Link href={`/publications/${lead.slug}`}>{lead.title}</Link></h2><p>{lead.excerpt}</p><p className="card-meta">{lead.type.replaceAll("-", " ")} · {lead.publishedAt}</p></section>}
      <HomeSection title="Recent dispatches" items={dispatches.length ? dispatches : publications.slice(0, 3)} />
      <HomeSection title="Research" items={research} />
      <HomeSection title="Intelligence" items={intelligence} />
      <section className="supporting-section"><h2>How Dispatch works</h2><p>Mayday Dispatch publishes public-safe research and analytical reporting with attributable sources, clear caveats, and visible corrections.</p><Link href="/methodology">Read our methodology and standards</Link></section>
    </main>
  );
}

function HomeSection({ title, items }: { title: string; items: Awaited<ReturnType<typeof browsePublications>> }) {
  if (!items.length) return null;
  return <section aria-labelledby={title.toLowerCase().replaceAll(" ", "-")}><div className="section-heading"><h2 id={title.toLowerCase().replaceAll(" ", "-")}>{title}</h2><Link href="/publications">Browse all</Link></div><div className="publication-grid">{items.map((publication) => <PublicationCard key={publication.id} publication={publication} />)}</div></section>;
}

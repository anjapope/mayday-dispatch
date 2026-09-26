import type { Metadata } from "next";
import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
import { PublicationCard } from "./publication-card";

export const metadata: Metadata = { title: "Dispatch | Mayday Dispatch", description: "Browse public research, reports, and dispatches." };
type Props = { searchParams: Promise<Record<string, string | undefined>> };
export default async function PublicationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const publications = await browsePublications({ query: params.q, type: params.type, tag: params.tag, seriesId: params.series });
  return <main className="shell"><header className="masthead"><p className="eyebrow">Dispatch archive</p><h1>Published work</h1><p className="lede">Search and browse public research, intelligence, and time-sensitive dispatches.</p></header>
    <form className="filter-form" method="get"><label>Search public work<input name="q" defaultValue={params.q} /></label><label>Type<select name="type" defaultValue={params.type}><option value="">All types</option><option value="academic-research-article">Research</option><option value="overwatch-osint-report">Intelligence</option><option value="short-dispatch">Short dispatch</option></select></label><button type="submit">Search</button></form>
    <p className="card-meta">{publications.length} public publications</p><div className="publication-grid">{publications.map((item) => <PublicationCard key={item.id} publication={item} />)}</div>
    <p className="supporting-section"><Link href="/topics">Browse topics</Link></p></main>;
}

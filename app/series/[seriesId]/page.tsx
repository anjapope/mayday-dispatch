import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSeries } from "@/publications/public-query";
import { PublicationCard } from "../../publications/publication-card";

export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const seriesId = (await params).seriesId;
  const publications = await getPublicSeries(seriesId);
  if (!publications.length) notFound();
  return <main className="shell"><Link className="back-link" href="/publications">← Browse Dispatch</Link><header className="masthead"><p className="eyebrow">Ongoing coverage</p><h1>{seriesId}</h1><p className="lede">Chronological public reporting in this series.</p></header><div className="publication-grid">{publications.map((item) => <PublicationCard key={item.id} publication={item} />)}</div></main>;
}

import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
export default async function SeriesIndexPage() {
  const series = Array.from(new Set((await browsePublications()).map((item) => item.seriesId).filter((item): item is string => Boolean(item)))).sort();
  return <main className="shell"><header className="masthead"><p className="eyebrow">Ongoing coverage</p><h1>Series</h1><p className="lede">Recurring public reporting and continuing analytical coverage.</p></header>{series.length ? <ul className="topic-list">{series.map((id) => <li key={id}><Link href={`/series/${id}`}>{id}</Link></li>)}</ul> : <p>No public recurring series are currently available.</p>}</main>;
}

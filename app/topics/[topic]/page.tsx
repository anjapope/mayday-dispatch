import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
import { PublicationCard } from "../../publications/publication-card";
export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) { const topic = decodeURIComponent((await params).topic); const publications = await browsePublications({ tag: topic }); return <main className="shell"><Link className="back-link" href="/topics">← Topics</Link><header className="masthead"><p className="eyebrow">Topic</p><h1>{topic}</h1></header><div className="publication-grid">{publications.map((item) => <PublicationCard key={item.id} publication={item} />)}</div></main>; }

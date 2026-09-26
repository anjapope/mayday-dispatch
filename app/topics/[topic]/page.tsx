import type { Metadata } from "next";
import Link from "next/link";
import { browsePublications } from "@/publications/public-query";
import { canonicalUrl } from "@/publications/metadata";
import { PublicationCard } from "../../publications/publication-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const topic = decodeURIComponent((await params).topic);
  const canonical = canonicalUrl(`/topics/${encodeURIComponent(topic)}`);
  return {
    title: `${topic} | Mayday Dispatch`,
    alternates: canonical ? { canonical } : undefined,
  };
}

export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) { const topic = decodeURIComponent((await params).topic); const publications = await browsePublications({ tag: topic }); return <main className="shell"><Link className="back-link" href="/topics">← Topics</Link><header className="masthead"><p className="eyebrow">Topic</p><h1>{topic}</h1></header><div className="publication-grid">{publications.map((item) => <PublicationCard key={item.id} publication={item} />)}</div></main>; }

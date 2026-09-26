import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPublicationBySlug, getRelatedPublications } from "@/publications/public-query";
import { PublicationArticle } from "../publication-article";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const publication = await getPublicPublicationBySlug((await params).slug);
  return publication ? { title: `${publication.title} | Mayday Dispatch`, description: publication.excerpt } : {};
}
export default async function PublicationPage({ params }: Props) {
  const publication = await getPublicPublicationBySlug((await params).slug);
  if (!publication) notFound();
  const related = await getRelatedPublications(publication);
  return <main className="shell detail"><Link className="back-link" href="/publications">← Browse Dispatch</Link><PublicationArticle publication={publication} related={related} /></main>;
}

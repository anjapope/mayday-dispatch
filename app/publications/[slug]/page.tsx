import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicationBySlug } from "@/publications/repository";
import { PublicationArticle } from "../publication-article";

type PublicationPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicationPage({ params }: PublicationPageProps) {
  const { slug } = await params;
  const publication = await getPublicationBySlug(slug);

  if (!publication) {
    notFound();
  }

  return (
    <main className="shell detail">
      <Link className="back-link" href="/">
        ← All publications
      </Link>
      <PublicationArticle publication={publication} />
    </main>
  );
}

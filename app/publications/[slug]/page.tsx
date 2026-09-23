import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicationBySlug } from "@/publications/repository";

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
      <article>
        <header className="article-header">
          <p className="eyebrow">
            {publication.type.replaceAll("-", " ")} / {publication.lifecycleState}
          </p>
          <h1>{publication.title}</h1>
          <p className="lede">{publication.excerpt}</p>
          <dl className="metadata">
            <div>
              <dt>Published</dt>
              <dd>
                <time dateTime={publication.publishedAt}>{publication.publishedAt}</time>
              </dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>v{publication.revision.version}</dd>
            </div>
            <div>
              <dt>Reading time</dt>
              <dd>{publication.readingTimeMinutes} minutes</dd>
            </div>
          </dl>
        </header>

        <section className="body-copy" aria-label="Publication body">
          {publication.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        {publication.evidence.length > 0 && (
          <section className="supporting-section" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">Evidence</h2>
            <ul className="evidence-list">
              {publication.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <strong>{evidence.title}</strong>
                  {evidence.description && <p>{evidence.description}</p>}
                  {evidence.url && (
                    <a href={evidence.url} rel="noreferrer">
                      Open reference
                    </a>
                  )}
                  {evidence.citation && (
                    <p className="citation">
                      {evidence.citation.authors.join(", ")}. <em>{evidence.citation.title}</em>
                      {evidence.citation.publisher ? `, ${evidence.citation.publisher}` : ""}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="supporting-section" aria-labelledby="sources-heading">
          <h2 id="sources-heading">Sources</h2>
          <ol className="source-list">
            {publication.sources.map((source) => (
              <li key={source.id}>
                {source.url ? (
                  <a href={source.url} rel="noreferrer">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {" — "}
                {source.authors.join(", ")}
                {source.publisher ? ` (${source.publisher})` : ""}
              </li>
            ))}
          </ol>
        </section>
      </article>
    </main>
  );
}

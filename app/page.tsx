import Link from "next/link";
import { listPublications } from "@/publications/repository";

export default async function HomePage() {
  const publications = await listPublications();

  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">Mayday Dispatch / Phase One</p>
        <h1>Evidence-led briefings for consequential moments.</h1>
        <p className="lede">
          A small, deliberate publishing foundation for research, OSINT reports, and field dispatches.
        </p>
      </header>

      <section aria-labelledby="publication-list-heading">
        <div className="section-heading">
          <h2 id="publication-list-heading">Current publications</h2>
          <p>{publications.length} verified fixtures</p>
        </div>
        <div className="publication-grid">
          {publications.map((publication) => (
            <article className="publication-card" key={publication.id}>
              <p className="card-meta">
                {publication.type.replaceAll("-", " ")} <span aria-hidden="true">/</span> {publication.lifecycleState}
              </p>
              <h3>
                <Link href={`/publications/${publication.slug}`}>{publication.title}</Link>
              </h3>
              <p>{publication.excerpt}</p>
              <footer>
                <time dateTime={publication.publishedAt}>{publication.publishedAt}</time>
                <span>{publication.readingTimeMinutes} min read</span>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

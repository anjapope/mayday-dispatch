import type { PublicPublication } from "@/domain/publication";
import Link from "next/link";
import { PublicationCard } from "./publication-card";
import { CartographicField } from "../cartographic-field";

export function PublicationArticle({ publication, related = [] }: { publication: PublicPublication; related?: PublicPublication[] }) {
  return (
    <article>
      <header className="article-header">
        <p className="eyebrow">
          {publication.type.replaceAll("-", " ")} / {publication.lifecycleState}
        </p>
        <h1>{publication.title}</h1>
        {publication.subtitle && <p className="subtitle">{publication.subtitle}</p>}
        <p className="lede">{publication.excerpt}</p>
        {publication.notice && (
          <aside className="notice" aria-label={`${publication.notice.kind} notice`}>
            <strong>{publication.notice.kind === "correction" ? "Correction" : "Update"}:</strong>{" "}
            {publication.notice.note}
            {publication.notice.explanation && ` ${publication.notice.explanation}`}
          </aside>
        )}
        {(publication.methodology || publication.caveat) && (
          <aside className="notice" aria-label="Methodology and caveats">
            {publication.methodology && <p><strong>Methodology:</strong> {publication.methodology}</p>}
            {publication.caveat && <p><strong>Caveat:</strong> {publication.caveat}</p>}
          </aside>
        )}
        <dl className="metadata">
          <div><dt>Published</dt><dd><time dateTime={publication.publishedAt}>{publication.publishedAt}</time></dd></div>
          <div><dt>Revision</dt><dd>v{publication.revision.version}</dd></div>
          <div><dt>Reading time</dt><dd>{publication.readingTimeMinutes} minutes</dd></div>
          {publication.reportingPeriod && <div><dt>Reporting period</dt><dd>{publication.reportingPeriod}</dd></div>}
          {publication.seriesId && <div><dt>Series</dt><dd><Link href={`/series/${publication.seriesId}`}>{publication.seriesId}</Link></dd></div>}
        </dl>
      </header>
      <section className={`body-copy ${publication.type === "short-dispatch" ? "body-copy--dispatch" : ""}`} aria-label="Publication body">
        {publication.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>
      {publication.title.includes("Strait") && <section className="supporting-section geographic-context" aria-labelledby="geographic-context-heading"><h2 id="geographic-context-heading">Geographic context</h2><CartographicField variant="strait" /></section>}
      {related.length > 0 && (
        <section className="supporting-section" aria-labelledby="related-heading">
          <h2 id="related-heading">Related publications</h2>
          <div className="publication-grid">{related.map((item) => <PublicationCard key={item.id} publication={item} />)}</div>
        </section>
      )}
      {publication.evidence.length > 0 && (
        <section className="supporting-section" aria-labelledby="evidence-heading">
          <h2 id="evidence-heading">Evidence</h2>
          <ul className="evidence-list">
            {publication.evidence.map((evidence) => (
              <li key={evidence.id}>
                <strong>{evidence.title}</strong>
                {evidence.description && <p>{evidence.description}</p>}
                {evidence.url && <p><a href={evidence.url} rel="noreferrer">Open public reference</a></p>}
                {!evidence.url && evidence.citation && <p className="citation">Citation-only reference; the underlying artifact is not publicly downloadable.</p>}
                {evidence.citation && <p className="citation">{evidence.citation.authors.join(", ")}. <em>{evidence.citation.title}</em>{evidence.citation.publisher ? `, ${evidence.citation.publisher}` : ""}.</p>}
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
              {source.url ? <a href={source.url} rel="noreferrer">{source.title}</a> : source.title}
              {" — "}{source.authors.join(", ")}{source.publisher ? ` (${source.publisher})` : ""}
            </li>
          ))}
        </ol>
      </section>
      <section className="supporting-section" aria-labelledby="history-heading"><h2 id="history-heading">Publication history</h2><p>Originally published {publication.publishedAt}. Current version: {publication.revision.version} ({publication.revision.revisionType.replaceAll("-", " ")}), updated {publication.revision.updatedAt}.</p></section>
    </article>
  );
}

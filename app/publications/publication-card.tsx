import Link from "next/link";
import type { PublicPublication } from "@/domain/publication";

export function PublicationCard({ publication }: { publication: PublicPublication }) {
  return <article className="publication-card">
    <p className="card-meta">{publication.type.replaceAll("-", " ")}{publication.seriesId ? ` / ${publication.seriesId}` : ""}</p>
    <h3><Link href={`/publications/${publication.slug}`}>{publication.title}</Link></h3>
    <p>{publication.excerpt}</p>
    {publication.notice && <p className="status-note">{publication.notice.kind === "correction" ? "Corrected" : "Updated"}</p>}
    <footer><time dateTime={publication.publishedAt}>{publication.publishedAt}</time><span>{publication.readingTimeMinutes} min read</span></footer>
  </article>;
}
